//! Audio mastering chain: EQ, compression, limiting

use anyhow::Result;
use rubato::{FftFixedIn, Resampler};

use crate::types::{AudioBuffer, LoudnessTarget, MasterProfile, QC_TRUE_PEAK_MAX};

/// Apply the complete mastering chain to an audio buffer
pub fn apply_mastering(
    buffer: &mut AudioBuffer,
    profile: MasterProfile,
    target: LoudnessTarget,
) -> Result<MasteringResult> {
    // Step 1: Apply EQ based on profile
    apply_eq(buffer, profile)?;

    // Step 2: Apply multiband compression
    apply_multiband_compression(buffer, profile)?;

    // Step 3: Apply optional saturation
    if matches!(profile, MasterProfile::Warm | MasterProfile::Punchy) {
        apply_saturation(buffer, profile)?;
    }

    // Step 4: Apply brick-wall limiter with true peak ceiling
    let (final_lufs, final_true_peak) = apply_limiter(buffer, target)?;

    // Verify QC
    let passes_qc = final_true_peak <= QC_TRUE_PEAK_MAX;

    Ok(MasteringResult {
        final_lufs,
        final_true_peak,
        passes_qc,
    })
}

pub struct MasteringResult {
    pub final_lufs: f64,
    pub final_true_peak: f64,
    pub passes_qc: bool,
}

/// Apply EQ based on mastering profile
fn apply_eq(buffer: &mut AudioBuffer, profile: MasterProfile) -> Result<()> {
    let sample_rate = buffer.sample_rate as f32;

    // Define EQ parameters based on profile
    let (low_gain, mid_gain, high_gain, low_freq, high_freq) = match profile {
        MasterProfile::Balanced => (0.0, 0.0, 0.5, 80.0, 12000.0),
        MasterProfile::Warm => (1.5, -0.5, -1.0, 100.0, 8000.0),
        MasterProfile::Punchy => (2.0, 1.0, 1.5, 60.0, 10000.0),
        MasterProfile::Custom => (0.0, 0.0, 0.0, 80.0, 12000.0),
    };

    if low_gain == 0.0 && mid_gain == 0.0 && high_gain == 0.0 {
        return Ok(());
    }

    // Apply biquad filters for each band
    for channel in &mut buffer.samples {
        // Low shelf filter
        if low_gain.abs() > 0.01 {
            apply_low_shelf(channel, sample_rate, low_freq, low_gain);
        }

        // Mid band (peaking filter around 1kHz-3kHz)
        if mid_gain.abs() > 0.01 {
            apply_peaking_eq(channel, sample_rate, 2000.0, mid_gain, 1.0);
        }

        // High shelf filter
        if high_gain.abs() > 0.01 {
            apply_high_shelf(channel, sample_rate, high_freq, high_gain);
        }
    }

    Ok(())
}

/// Low shelf filter implementation
fn apply_low_shelf(samples: &mut [f32], sample_rate: f32, freq: f32, gain_db: f32) {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / 2.0 * ((a + 1.0 / a) * (1.0 / 0.707 - 1.0) + 2.0).sqrt();

    let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * a.sqrt() * alpha);
    let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
    let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * a.sqrt() * alpha);
    let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * a.sqrt() * alpha;
    let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
    let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * a.sqrt() * alpha;

    apply_biquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

/// High shelf filter implementation
fn apply_high_shelf(samples: &mut [f32], sample_rate: f32, freq: f32, gain_db: f32) {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / 2.0 * ((a + 1.0 / a) * (1.0 / 0.707 - 1.0) + 2.0).sqrt();

    let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * a.sqrt() * alpha);
    let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
    let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * a.sqrt() * alpha);
    let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * a.sqrt() * alpha;
    let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
    let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * a.sqrt() * alpha;

    apply_biquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

/// Peaking EQ filter implementation
fn apply_peaking_eq(samples: &mut [f32], sample_rate: f32, freq: f32, gain_db: f32, q: f32) {
    let a = 10.0_f32.powf(gain_db / 40.0);
    let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w0;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha / a;

    apply_biquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

/// Generic biquad filter
fn apply_biquad(samples: &mut [f32], b0: f32, b1: f32, b2: f32, a1: f32, a2: f32) {
    let mut x1 = 0.0_f32;
    let mut x2 = 0.0_f32;
    let mut y1 = 0.0_f32;
    let mut y2 = 0.0_f32;

    for sample in samples.iter_mut() {
        let x0 = *sample;
        let y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;

        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;

        *sample = y0;
    }
}

/// Apply multiband compression (3 bands)
fn apply_multiband_compression(buffer: &mut AudioBuffer, profile: MasterProfile) -> Result<()> {
    let sample_rate = buffer.sample_rate as f32;

    // Crossover frequencies
    let low_mid_freq = 200.0;
    let mid_high_freq = 2000.0;

    // Compression parameters based on profile
    let (low_ratio, mid_ratio, high_ratio, low_threshold, mid_threshold, high_threshold) =
        match profile {
            MasterProfile::Balanced => (2.0, 2.0, 2.0, -18.0, -16.0, -14.0),
            MasterProfile::Warm => (3.0, 2.0, 1.5, -16.0, -18.0, -20.0),
            MasterProfile::Punchy => (4.0, 3.0, 2.5, -14.0, -14.0, -12.0),
            MasterProfile::Custom => (2.0, 2.0, 2.0, -18.0, -16.0, -14.0),
        };

    for channel in &mut buffer.samples {
        // Split into 3 bands using Linkwitz-Riley crossover filters
        let mut low_band = channel.clone();
        let mut mid_band = channel.clone();
        let mut high_band = channel.clone();

        // Low band: low-pass at low_mid_freq
        apply_lowpass_lr4(&mut low_band, sample_rate, low_mid_freq);

        // High band: high-pass at mid_high_freq
        apply_highpass_lr4(&mut high_band, sample_rate, mid_high_freq);

        // Mid band: bandpass
        apply_highpass_lr4(&mut mid_band, sample_rate, low_mid_freq);
        apply_lowpass_lr4(&mut mid_band, sample_rate, mid_high_freq);

        // Apply compression to each band
        apply_compression(
            &mut low_band,
            sample_rate,
            low_threshold,
            low_ratio,
            20.0,
            200.0,
        );
        apply_compression(
            &mut mid_band,
            sample_rate,
            mid_threshold,
            mid_ratio,
            10.0,
            100.0,
        );
        apply_compression(
            &mut high_band,
            sample_rate,
            high_threshold,
            high_ratio,
            5.0,
            50.0,
        );

        // Sum the bands
        for (i, sample) in channel.iter_mut().enumerate() {
            *sample = low_band[i] + mid_band[i] + high_band[i];
        }
    }

    Ok(())
}

/// Linkwitz-Riley 4th order lowpass
fn apply_lowpass_lr4(samples: &mut [f32], sample_rate: f32, freq: f32) {
    // Apply 2nd order Butterworth twice
    apply_lowpass_butterworth(samples, sample_rate, freq);
    apply_lowpass_butterworth(samples, sample_rate, freq);
}

/// Linkwitz-Riley 4th order highpass
fn apply_highpass_lr4(samples: &mut [f32], sample_rate: f32, freq: f32) {
    apply_highpass_butterworth(samples, sample_rate, freq);
    apply_highpass_butterworth(samples, sample_rate, freq);
}

fn apply_lowpass_butterworth(samples: &mut [f32], sample_rate: f32, freq: f32) {
    let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * 0.707);

    let b0 = (1.0 - cos_w0) / 2.0;
    let b1 = 1.0 - cos_w0;
    let b2 = (1.0 - cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    apply_biquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

fn apply_highpass_butterworth(samples: &mut [f32], sample_rate: f32, freq: f32) {
    let w0 = 2.0 * std::f32::consts::PI * freq / sample_rate;
    let cos_w0 = w0.cos();
    let sin_w0 = w0.sin();
    let alpha = sin_w0 / (2.0 * 0.707);

    let b0 = (1.0 + cos_w0) / 2.0;
    let b1 = -(1.0 + cos_w0);
    let b2 = (1.0 + cos_w0) / 2.0;
    let a0 = 1.0 + alpha;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha;

    apply_biquad(samples, b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0);
}

/// Apply compression to a signal
fn apply_compression(
    samples: &mut [f32],
    sample_rate: f32,
    threshold_db: f32,
    ratio: f32,
    attack_ms: f32,
    release_ms: f32,
) {
    let threshold = 10.0_f32.powf(threshold_db / 20.0);
    let attack_coef = (-1.0 / (attack_ms * sample_rate / 1000.0)).exp();
    let release_coef = (-1.0 / (release_ms * sample_rate / 1000.0)).exp();

    let mut envelope = 0.0_f32;

    for sample in samples.iter_mut() {
        let input_abs = sample.abs();

        // Envelope follower
        if input_abs > envelope {
            envelope = attack_coef * envelope + (1.0 - attack_coef) * input_abs;
        } else {
            envelope = release_coef * envelope + (1.0 - release_coef) * input_abs;
        }

        // Calculate gain reduction
        let gain = if envelope > threshold {
            let over_db = 20.0 * (envelope / threshold).log10();
            let reduction_db = over_db * (1.0 - 1.0 / ratio);
            10.0_f32.powf(-reduction_db / 20.0)
        } else {
            1.0
        };

        *sample *= gain;
    }
}

/// Apply tape saturation / harmonic exciter
fn apply_saturation(buffer: &mut AudioBuffer, profile: MasterProfile) -> Result<()> {
    let drive = match profile {
        MasterProfile::Warm => 0.3,
        MasterProfile::Punchy => 0.5,
        _ => 0.2,
    };

    for channel in &mut buffer.samples {
        for sample in channel.iter_mut() {
            // Soft clipping using tanh
            let x = *sample * (1.0 + drive);
            *sample = x.tanh();
        }
    }

    Ok(())
}

/// Apply brick-wall limiter with true peak ceiling
fn apply_limiter(buffer: &mut AudioBuffer, target: LoudnessTarget) -> Result<(f64, f64)> {
    let target_lufs = target.lufs_value();
    let ceiling_db = QC_TRUE_PEAK_MAX;
    let ceiling_linear = 10.0_f32.powf(ceiling_db as f32 / 20.0);

    let sample_rate = buffer.sample_rate as f32;
    let lookahead_samples = (0.005 * sample_rate) as usize; // 5ms lookahead
    let release_ms = 100.0;
    let release_coef = (-1.0 / (release_ms * sample_rate / 1000.0)).exp();

    // First pass: Calculate current loudness
    let current_lufs = calculate_loudness(buffer)?;

    // Calculate makeup gain needed
    let makeup_db = target_lufs - current_lufs;
    let makeup_gain = 10.0_f64.powf(makeup_db / 20.0) as f32;

    // Apply makeup gain and limiting
    for channel in &mut buffer.samples {
        // Create lookahead buffer
        let len = channel.len();
        let mut lookahead: Vec<f32> = vec![0.0; lookahead_samples];
        let mut gain_reduction = 1.0_f32;

        for i in 0..len {
            // Apply makeup gain
            channel[i] *= makeup_gain;

            // Lookahead peak detection
            let lookahead_idx = i % lookahead_samples;
            lookahead[lookahead_idx] = channel[i].abs();

            let peak = lookahead.iter().cloned().fold(0.0_f32, f32::max);

            // Calculate required gain reduction
            let target_gr = if peak > ceiling_linear {
                ceiling_linear / peak
            } else {
                1.0
            };

            // Smooth gain reduction
            if target_gr < gain_reduction {
                gain_reduction = target_gr; // Instant attack
            } else {
                gain_reduction = release_coef * gain_reduction + (1.0 - release_coef) * target_gr;
            }

            // Apply gain reduction with lookahead delay
            if i >= lookahead_samples {
                channel[i - lookahead_samples] *= gain_reduction;
            }
        }

        // Apply to remaining samples
        for i in (len - lookahead_samples)..len {
            channel[i] *= gain_reduction;
        }
    }

    // Measure final loudness and true peak
    let final_lufs = calculate_loudness(buffer)?;
    let final_true_peak = calculate_true_peak(buffer)?;

    Ok((final_lufs, final_true_peak))
}

/// Calculate integrated loudness using ebur128
fn calculate_loudness(buffer: &AudioBuffer) -> Result<f64> {
    use ebur128::{EbuR128, Mode};

    let mode = Mode::I;
    let mut ebu = EbuR128::new(buffer.channels as u32, buffer.sample_rate, mode)?;

    let frame_count = buffer.frame_count();
    let chunk_size = 4096;

    for start in (0..frame_count).step_by(chunk_size) {
        let end = (start + chunk_size).min(frame_count);
        let chunk_len = end - start;

        let mut interleaved = Vec::with_capacity(chunk_len * buffer.channels);
        for i in start..end {
            for ch in 0..buffer.channels {
                interleaved.push(buffer.samples[ch][i]);
            }
        }

        ebu.add_frames_f32(&interleaved)?;
    }

    Ok(ebu.loudness_global().unwrap_or(-70.0))
}

/// Calculate true peak using 4x oversampling
fn calculate_true_peak(buffer: &AudioBuffer) -> Result<f64> {
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

        let chunk: Vec<Vec<f32>> = if actual_len < chunk_size {
            buffer
                .samples
                .iter()
                .map(|ch| {
                    let mut c = ch[start..end].to_vec();
                    c.resize(chunk_size, 0.0);
                    c
                })
                .collect()
        } else {
            buffer
                .samples
                .iter()
                .map(|ch| ch[start..end].to_vec())
                .collect()
        };

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

    Ok(if max_peak > 0.0 {
        20.0 * (max_peak as f64).log10()
    } else {
        -96.0
    })
}
