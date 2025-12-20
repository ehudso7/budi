//! Audio analysis: loudness, peaks, spectral metrics

use anyhow::Result;
use ebur128::{EbuR128, Mode};
use realfft::RealFftPlanner;
use rubato::{FftFixedIn, Resampler};

use crate::types::{AnalysisResult, AudioBuffer};

/// Analyze an audio buffer and return comprehensive metrics
pub fn analyze_audio(buffer: &AudioBuffer, bit_depth: u32) -> Result<AnalysisResult> {
    // Loudness analysis using ebur128
    let (integrated_lufs, loudness_range, short_term_max, momentary_max) =
        analyze_loudness(buffer)?;

    // Peak analysis
    let sample_peak = calculate_sample_peak(buffer);
    let true_peak = calculate_true_peak(buffer)?;

    // Clipping detection
    let (has_clipping, clipped_samples) = detect_clipping(buffer);

    // DC offset detection
    let (has_dc_offset, dc_offset_value) = detect_dc_offset(buffer);

    // Spectral analysis
    let (spectral_centroid, spectral_rolloff) = analyze_spectrum(buffer)?;

    // Stereo analysis (only for stereo tracks)
    let (stereo_correlation, stereo_width) = if buffer.channels >= 2 {
        analyze_stereo(buffer)
    } else {
        (None, None)
    };

    Ok(AnalysisResult {
        integrated_lufs,
        loudness_range,
        short_term_max,
        momentary_max,
        sample_peak,
        true_peak,
        spectral_centroid,
        spectral_rolloff,
        stereo_correlation,
        stereo_width,
        has_clipping,
        has_dc_offset,
        dc_offset_value,
        clipped_samples,
        sample_rate: buffer.sample_rate,
        bit_depth,
        channels: buffer.channels,
        duration_secs: buffer.duration_secs(),
    })
}

/// Analyze loudness using ITU-R BS.1770 (via ebur128)
fn analyze_loudness(buffer: &AudioBuffer) -> Result<(f64, f64, f64, f64)> {
    let mode = Mode::I | Mode::LRA | Mode::S | Mode::M;
    let mut ebu = EbuR128::new(buffer.channels as u32, buffer.sample_rate, mode)?;

    // Process audio in chunks
    let chunk_size = 4096;
    let frame_count = buffer.frame_count();

    for start in (0..frame_count).step_by(chunk_size) {
        let end = (start + chunk_size).min(frame_count);
        let chunk_len = end - start;

        // Interleave samples for ebur128
        let mut interleaved = Vec::with_capacity(chunk_len * buffer.channels);
        for i in start..end {
            for ch in 0..buffer.channels {
                interleaved.push(buffer.samples[ch][i]);
            }
        }

        ebu.add_frames_f32(&interleaved)?;
    }

    let integrated = ebu.loudness_global().unwrap_or(-70.0);
    let lra = ebu.loudness_range().unwrap_or(0.0);

    // Get max short-term and momentary
    let short_term_max = ebu.loudness_shortterm().unwrap_or(-70.0);
    let momentary_max = ebu.loudness_momentary().unwrap_or(-70.0);

    Ok((integrated, lra, short_term_max, momentary_max))
}

/// Calculate sample peak in dBFS
fn calculate_sample_peak(buffer: &AudioBuffer) -> f64 {
    let mut max_sample: f32 = 0.0;

    for channel in &buffer.samples {
        for &sample in channel {
            let abs_sample = sample.abs();
            if abs_sample > max_sample {
                max_sample = abs_sample;
            }
        }
    }

    if max_sample > 0.0 {
        20.0 * (max_sample as f64).log10()
    } else {
        -96.0 // Below noise floor
    }
}

/// Calculate true peak in dBTP using 4x oversampling
fn calculate_true_peak(buffer: &AudioBuffer) -> Result<f64> {
    // Upsample to 4x for inter-sample peak detection
    let target_rate = buffer.sample_rate * 4;

    let mut resampler = FftFixedIn::<f32>::new(
        buffer.sample_rate as usize,
        target_rate as usize,
        1024,
        2,
        buffer.channels,
    )?;

    let mut max_peak: f32 = 0.0;
    let chunk_size = resampler.input_frames_next();
    let frame_count = buffer.frame_count();

    for start in (0..frame_count).step_by(chunk_size) {
        let end = (start + chunk_size).min(frame_count);
        let actual_len = end - start;

        if actual_len < chunk_size {
            // Pad the last chunk
            let mut padded: Vec<Vec<f32>> = buffer
                .samples
                .iter()
                .map(|ch| {
                    let mut chunk = ch[start..end].to_vec();
                    chunk.resize(chunk_size, 0.0);
                    chunk
                })
                .collect();

            if let Ok(output) = resampler.process(&padded, None) {
                for ch in &output {
                    for &sample in ch {
                        let abs = sample.abs();
                        if abs > max_peak {
                            max_peak = abs;
                        }
                    }
                }
            }
        } else {
            let chunk: Vec<Vec<f32>> = buffer
                .samples
                .iter()
                .map(|ch| ch[start..end].to_vec())
                .collect();

            if let Ok(output) = resampler.process(&chunk, None) {
                for ch in &output {
                    for &sample in ch {
                        let abs = sample.abs();
                        if abs > max_peak {
                            max_peak = abs;
                        }
                    }
                }
            }
        }
    }

    let true_peak_db = if max_peak > 0.0 {
        20.0 * (max_peak as f64).log10()
    } else {
        -96.0
    };

    Ok(true_peak_db)
}

/// Detect clipping (samples at or above 1.0)
fn detect_clipping(buffer: &AudioBuffer) -> (bool, usize) {
    let threshold = 0.99; // Slightly below 1.0 to catch near-clipping
    let mut clipped_count = 0;

    for channel in &buffer.samples {
        for &sample in channel {
            if sample.abs() >= threshold {
                clipped_count += 1;
            }
        }
    }

    (clipped_count > 0, clipped_count)
}

/// Detect DC offset
fn detect_dc_offset(buffer: &AudioBuffer) -> (bool, Option<f64>) {
    if buffer.samples.is_empty() || buffer.samples[0].is_empty() {
        return (false, None);
    }

    // Calculate average sample value across all channels
    let mut total_sum: f64 = 0.0;
    let mut total_samples: usize = 0;

    for channel in &buffer.samples {
        let sum: f64 = channel.iter().map(|&s| s as f64).sum();
        total_sum += sum;
        total_samples += channel.len();
    }

    let dc_offset = total_sum / total_samples as f64;
    let threshold = 0.001; // 0.1% threshold

    (dc_offset.abs() > threshold, Some(dc_offset))
}

/// Analyze spectral characteristics
fn analyze_spectrum(buffer: &AudioBuffer) -> Result<(Option<f64>, Option<f64>)> {
    if buffer.samples.is_empty() || buffer.samples[0].is_empty() {
        return Ok((None, None));
    }

    let fft_size = 4096;
    let mut planner = RealFftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    // Mix channels to mono for spectral analysis
    let mono: Vec<f32> = (0..buffer.frame_count())
        .map(|i| {
            let sum: f32 = buffer
                .samples
                .iter()
                .map(|ch| ch.get(i).unwrap_or(&0.0))
                .sum();
            sum / buffer.channels as f32
        })
        .collect();

    if mono.len() < fft_size {
        return Ok((None, None));
    }

    // Process multiple windows and average
    let hop_size = fft_size / 2;
    let num_windows = (mono.len() - fft_size) / hop_size + 1;

    let mut avg_magnitudes = vec![0.0f64; fft_size / 2 + 1];

    for window_idx in 0..num_windows {
        let start = window_idx * hop_size;
        let mut input: Vec<f32> = mono[start..start + fft_size].to_vec();

        // Apply Hann window
        for (i, sample) in input.iter_mut().enumerate() {
            let window =
                0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / fft_size as f32).cos());
            *sample *= window;
        }

        let mut spectrum = fft.make_output_vec();
        fft.process(&mut input, &mut spectrum)?;

        // Accumulate magnitudes
        for (i, c) in spectrum.iter().enumerate() {
            let mag = (c.re * c.re + c.im * c.im).sqrt() as f64;
            avg_magnitudes[i] += mag;
        }
    }

    // Average
    for mag in &mut avg_magnitudes {
        *mag /= num_windows as f64;
    }

    // Calculate spectral centroid
    let freq_resolution = buffer.sample_rate as f64 / fft_size as f64;
    let mut weighted_sum = 0.0;
    let mut mag_sum = 0.0;

    for (i, &mag) in avg_magnitudes.iter().enumerate() {
        let freq = i as f64 * freq_resolution;
        weighted_sum += freq * mag;
        mag_sum += mag;
    }

    let spectral_centroid = if mag_sum > 0.0 {
        Some(weighted_sum / mag_sum)
    } else {
        None
    };

    // Calculate spectral rolloff (frequency below which 85% of energy exists)
    let total_energy: f64 = avg_magnitudes.iter().map(|m| m * m).sum();
    let rolloff_threshold = total_energy * 0.85;
    let mut cumulative_energy = 0.0;
    let mut rolloff_bin = 0;

    for (i, &mag) in avg_magnitudes.iter().enumerate() {
        cumulative_energy += mag * mag;
        if cumulative_energy >= rolloff_threshold {
            rolloff_bin = i;
            break;
        }
    }

    let spectral_rolloff = Some(rolloff_bin as f64 * freq_resolution);

    Ok((spectral_centroid, spectral_rolloff))
}

/// Analyze stereo characteristics
fn analyze_stereo(buffer: &AudioBuffer) -> (Option<f64>, Option<f64>) {
    if buffer.channels < 2 {
        return (None, None);
    }

    let left = &buffer.samples[0];
    let right = &buffer.samples[1];
    let len = left.len().min(right.len());

    if len == 0 {
        return (None, None);
    }

    // Calculate correlation coefficient
    let mut sum_l: f64 = 0.0;
    let mut sum_r: f64 = 0.0;
    let mut sum_ll: f64 = 0.0;
    let mut sum_rr: f64 = 0.0;
    let mut sum_lr: f64 = 0.0;

    for i in 0..len {
        let l = left[i] as f64;
        let r = right[i] as f64;
        sum_l += l;
        sum_r += r;
        sum_ll += l * l;
        sum_rr += r * r;
        sum_lr += l * r;
    }

    let n = len as f64;
    let mean_l = sum_l / n;
    let mean_r = sum_r / n;

    let var_l = sum_ll / n - mean_l * mean_l;
    let var_r = sum_rr / n - mean_r * mean_r;
    let cov_lr = sum_lr / n - mean_l * mean_r;

    let correlation = if var_l > 0.0 && var_r > 0.0 {
        cov_lr / (var_l.sqrt() * var_r.sqrt())
    } else {
        0.0
    };

    // Calculate stereo width (based on mid/side ratio)
    let mut mid_energy: f64 = 0.0;
    let mut side_energy: f64 = 0.0;

    for i in 0..len {
        let l = left[i] as f64;
        let r = right[i] as f64;
        let mid = (l + r) / 2.0;
        let side = (l - r) / 2.0;
        mid_energy += mid * mid;
        side_energy += side * side;
    }

    let stereo_width = if mid_energy + side_energy > 0.0 {
        side_energy / (mid_energy + side_energy)
    } else {
        0.0
    };

    (Some(correlation), Some(stereo_width))
}
