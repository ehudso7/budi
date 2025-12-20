//! Audio repair and fix operations

use crate::types::{AudioBuffer, FixChange};
use anyhow::Result;

/// Apply a list of fix modules to an audio buffer
pub fn apply_fixes(buffer: &mut AudioBuffer, modules: &[String]) -> Result<Vec<FixChange>> {
    let mut changes = Vec::new();

    for module in modules {
        let change = match module.as_str() {
            "normalize" => apply_normalize(buffer)?,
            "clip_repair" => apply_clip_repair(buffer)?,
            "de_ess" => apply_de_ess(buffer)?,
            "noise_reduction" => apply_noise_reduction(buffer)?,
            "dc_offset" => apply_dc_offset_removal(buffer)?,
            "silence_trim" => apply_silence_trim(buffer)?,
            _ => {
                tracing::warn!("Unknown fix module: {}", module);
                continue;
            }
        };

        if let Some(change) = change {
            changes.push(change);
        }
    }

    Ok(changes)
}

/// Normalize audio to -1dB peak
fn apply_normalize(buffer: &mut AudioBuffer) -> Result<Option<FixChange>> {
    let target_db = -1.0;
    let target_linear = 10.0_f32.powf(target_db / 20.0);

    // Find current peak
    let mut max_sample: f32 = 0.0;
    for channel in &buffer.samples {
        for &sample in channel {
            let abs = sample.abs();
            if abs > max_sample {
                max_sample = abs;
            }
        }
    }

    if max_sample < 0.0001 {
        return Ok(None); // Too quiet to normalize
    }

    let gain = target_linear / max_sample;

    if (gain - 1.0).abs() < 0.01 {
        return Ok(None); // Already normalized
    }

    // Apply gain
    for channel in &mut buffer.samples {
        for sample in channel {
            *sample *= gain;
        }
    }

    let gain_db = 20.0 * gain.log10();
    Ok(Some(FixChange {
        module: "normalize".to_string(),
        description: format!("Applied {:.1}dB gain to normalize to -1dB peak", gain_db),
    }))
}

/// Repair clipped samples using interpolation
fn apply_clip_repair(buffer: &mut AudioBuffer) -> Result<Option<FixChange>> {
    let clip_threshold = 0.99;
    let mut repaired_count = 0;

    for channel in &mut buffer.samples {
        let len = channel.len();
        if len < 3 {
            continue;
        }

        // Find clipped regions and repair
        let mut i = 1;
        while i < len - 1 {
            if channel[i].abs() >= clip_threshold {
                // Find the extent of the clipped region
                let start = i;
                while i < len - 1 && channel[i].abs() >= clip_threshold {
                    i += 1;
                }
                let end = i;

                // Interpolate across the clipped region
                if start > 0 && end < len {
                    let start_val = channel[start - 1];
                    let end_val = channel[end];
                    let region_len = end - start + 1;

                    // Use cubic interpolation for smoother repair
                    for j in 0..region_len {
                        let t = (j + 1) as f32 / (region_len + 1) as f32;
                        // Smooth step interpolation
                        let smooth_t = t * t * (3.0 - 2.0 * t);
                        channel[start + j] = start_val + (end_val - start_val) * smooth_t;
                        repaired_count += 1;
                    }
                }
            }
            i += 1;
        }
    }

    if repaired_count > 0 {
        Ok(Some(FixChange {
            module: "clip_repair".to_string(),
            description: format!(
                "Repaired {} clipped samples using interpolation",
                repaired_count
            ),
        }))
    } else {
        Ok(None)
    }
}

/// Basic de-essing using dynamic EQ on sibilant frequencies
fn apply_de_ess(buffer: &mut AudioBuffer) -> Result<Option<FixChange>> {
    // De-essing targets frequencies between 4kHz and 10kHz
    // This is a simplified implementation using a dynamic attenuator

    let sibilant_low = 4000.0;
    let sibilant_high = 10000.0;
    let threshold = 0.3; // Threshold for detection
    let ratio = 0.5; // Reduction ratio

    let sample_rate = buffer.sample_rate as f32;

    // Simple high-pass filter coefficients for sibilance detection
    let rc = 1.0 / (2.0 * std::f32::consts::PI * sibilant_low);
    let dt = 1.0 / sample_rate;
    let alpha = dt / (rc + dt);

    let mut total_reduction = 0.0_f64;
    let mut reduction_count = 0;

    for channel in &mut buffer.samples {
        let len = channel.len();
        if len < 2 {
            continue;
        }

        let mut prev_hp = 0.0_f32;
        let mut envelope = 0.0_f32;

        // Attack and release times
        let attack = 0.001 * sample_rate; // 1ms
        let release = 0.050 * sample_rate; // 50ms
        let attack_coef = 1.0 / attack;
        let release_coef = 1.0 / release;

        for i in 0..len {
            // High-pass filter to isolate sibilance
            let hp = alpha * (prev_hp + channel[i] - if i > 0 { channel[i - 1] } else { 0.0 });
            prev_hp = hp;

            // Envelope follower
            let hp_abs = hp.abs();
            if hp_abs > envelope {
                envelope += (hp_abs - envelope) * attack_coef;
            } else {
                envelope += (hp_abs - envelope) * release_coef;
            }

            // Apply gain reduction if above threshold
            if envelope > threshold {
                let gain_reduction = 1.0 - (1.0 - ratio) * (envelope - threshold) / envelope;
                let gain = gain_reduction.max(0.3); // Limit max reduction

                // Only reduce the high frequency content
                channel[i] = channel[i] * (1.0 - alpha) + hp * gain * alpha;
                total_reduction += (1.0 - gain) as f64;
                reduction_count += 1;
            }
        }
    }

    if reduction_count > 0 {
        let avg_reduction = total_reduction / reduction_count as f64 * 100.0;
        Ok(Some(FixChange {
            module: "de_ess".to_string(),
            description: format!(
                "Applied de-essing with {:.1}% average reduction on {} samples",
                avg_reduction, reduction_count
            ),
        }))
    } else {
        Ok(None)
    }
}

/// Basic noise reduction using spectral gating
fn apply_noise_reduction(buffer: &mut AudioBuffer) -> Result<Option<FixChange>> {
    // Simple noise gate implementation
    let noise_floor_db = -60.0;
    let noise_floor = 10.0_f32.powf(noise_floor_db / 20.0);
    let gate_threshold = noise_floor * 2.0;

    let sample_rate = buffer.sample_rate as f32;
    let attack_samples = (0.005 * sample_rate) as usize; // 5ms attack
    let release_samples = (0.050 * sample_rate) as usize; // 50ms release

    let mut gated_samples = 0;

    for channel in &mut buffer.samples {
        let len = channel.len();
        let mut envelope = 0.0_f32;
        let mut gate_open = false;
        let mut hold_counter = 0;

        for i in 0..len {
            let abs_sample = channel[i].abs();

            // Envelope follower
            if abs_sample > envelope {
                envelope += (abs_sample - envelope) / attack_samples as f32;
            } else {
                envelope += (abs_sample - envelope) / release_samples as f32;
            }

            // Gate logic
            if envelope > gate_threshold {
                gate_open = true;
                hold_counter = release_samples;
            } else if hold_counter > 0 {
                hold_counter -= 1;
            } else {
                gate_open = false;
            }

            // Apply gentle attenuation when gate is closed
            if !gate_open {
                let attenuation = 0.1 + 0.9 * (envelope / gate_threshold).min(1.0);
                channel[i] *= attenuation;
                gated_samples += 1;
            }
        }
    }

    if gated_samples > 0 {
        let percentage =
            gated_samples as f64 / (buffer.frame_count() * buffer.channels) as f64 * 100.0;
        Ok(Some(FixChange {
            module: "noise_reduction".to_string(),
            description: format!("Applied noise gating to {:.1}% of samples", percentage),
        }))
    } else {
        Ok(None)
    }
}

/// Remove DC offset
fn apply_dc_offset_removal(buffer: &mut AudioBuffer) -> Result<Option<FixChange>> {
    let mut offsets = Vec::new();

    for channel in &mut buffer.samples {
        if channel.is_empty() {
            continue;
        }

        // Calculate DC offset (mean)
        let sum: f64 = channel.iter().map(|&s| s as f64).sum();
        let offset = (sum / channel.len() as f64) as f32;

        if offset.abs() > 0.0001 {
            // Remove offset
            for sample in channel.iter_mut() {
                *sample -= offset;
            }
            offsets.push(offset);
        }
    }

    if !offsets.is_empty() {
        let avg_offset: f32 = offsets.iter().sum::<f32>() / offsets.len() as f32;
        Ok(Some(FixChange {
            module: "dc_offset".to_string(),
            description: format!(
                "Removed DC offset of {:.6} from {} channel(s)",
                avg_offset,
                offsets.len()
            ),
        }))
    } else {
        Ok(None)
    }
}

/// Trim silence from start and end
fn apply_silence_trim(buffer: &mut AudioBuffer) -> Result<Option<FixChange>> {
    let silence_threshold = 0.001; // -60dB
    let min_silence_ms = 100; // Minimum silence to keep
    let min_silence_samples = (min_silence_ms as f32 * buffer.sample_rate as f32 / 1000.0) as usize;

    let frame_count = buffer.frame_count();
    if frame_count == 0 {
        return Ok(None);
    }

    // Find first non-silent frame
    let mut start_frame = 0;
    for i in 0..frame_count {
        let max_sample: f32 = buffer
            .samples
            .iter()
            .map(|ch| ch.get(i).unwrap_or(&0.0).abs())
            .fold(0.0, f32::max);

        if max_sample > silence_threshold {
            start_frame = i.saturating_sub(min_silence_samples);
            break;
        }
    }

    // Find last non-silent frame
    let mut end_frame = frame_count;
    for i in (0..frame_count).rev() {
        let max_sample: f32 = buffer
            .samples
            .iter()
            .map(|ch| ch.get(i).unwrap_or(&0.0).abs())
            .fold(0.0, f32::max);

        if max_sample > silence_threshold {
            end_frame = (i + min_silence_samples).min(frame_count);
            break;
        }
    }

    let trimmed_start = start_frame;
    let trimmed_end = frame_count - end_frame;

    if trimmed_start > 0 || trimmed_end > 0 {
        // Trim the buffer
        for channel in &mut buffer.samples {
            *channel = channel[start_frame..end_frame].to_vec();
        }

        let start_ms = trimmed_start as f64 * 1000.0 / buffer.sample_rate as f64;
        let end_ms = trimmed_end as f64 * 1000.0 / buffer.sample_rate as f64;

        Ok(Some(FixChange {
            module: "silence_trim".to_string(),
            description: format!(
                "Trimmed {:.0}ms from start and {:.0}ms from end",
                start_ms, end_ms
            ),
        }))
    } else {
        Ok(None)
    }
}
