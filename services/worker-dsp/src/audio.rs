//! Audio file reading and writing using Symphonia and Hound

use anyhow::{Context, Result};
use hound::{SampleFormat, WavSpec, WavWriter};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use symphonia::core::audio::{AudioBufferRef, Signal};
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use crate::types::AudioBuffer;

/// Read an audio file and return the decoded samples
pub fn read_audio_file(path: &Path) -> Result<AudioBuffer> {
    let file = File::open(path).context("Failed to open audio file")?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Create a hint for the file type
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    // Probe the file
    let format_opts = FormatOptions::default();
    let metadata_opts = MetadataOptions::default();
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &metadata_opts)
        .context("Failed to probe audio format")?;

    let mut format = probed.format;

    // Find the first audio track
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .context("No audio track found")?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    let sample_rate = codec_params.sample_rate.unwrap_or(44100);
    let channels = codec_params.channels.map(|c| c.count()).unwrap_or(2);

    // Create decoder
    let decoder_opts = DecoderOptions::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &decoder_opts)
        .context("Failed to create decoder")?;

    let mut audio_buffer = AudioBuffer::new(channels, sample_rate);

    // Decode all packets
    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(e) => return Err(e.into()),
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = decoder.decode(&packet)?;
        append_samples(&mut audio_buffer, decoded)?;
    }

    Ok(audio_buffer)
}

/// Append decoded samples to the audio buffer
fn append_samples(buffer: &mut AudioBuffer, decoded: AudioBufferRef) -> Result<()> {
    match decoded {
        AudioBufferRef::F32(buf) => {
            for ch in 0..buffer.channels.min(buf.spec().channels.count()) {
                let plane = buf.chan(ch);
                buffer.samples[ch].extend_from_slice(plane);
            }
        }
        AudioBufferRef::S16(buf) => {
            for ch in 0..buffer.channels.min(buf.spec().channels.count()) {
                let plane = buf.chan(ch);
                buffer.samples[ch].extend(plane.iter().map(|&s| s as f32 / 32768.0));
            }
        }
        AudioBufferRef::S32(buf) => {
            for ch in 0..buffer.channels.min(buf.spec().channels.count()) {
                let plane = buf.chan(ch);
                buffer.samples[ch].extend(plane.iter().map(|&s| s as f32 / 2147483648.0));
            }
        }
        AudioBufferRef::U8(buf) => {
            for ch in 0..buffer.channels.min(buf.spec().channels.count()) {
                let plane = buf.chan(ch);
                buffer.samples[ch].extend(plane.iter().map(|&s| (s as f32 - 128.0) / 128.0));
            }
        }
        _ => {
            // Handle other formats by converting to f32
            anyhow::bail!("Unsupported audio format");
        }
    }
    Ok(())
}

/// Write audio buffer to a WAV file
pub fn write_wav_file(buffer: &AudioBuffer, path: &Path, bit_depth: u16) -> Result<()> {
    let spec = WavSpec {
        channels: buffer.channels as u16,
        sample_rate: buffer.sample_rate,
        bits_per_sample: bit_depth,
        sample_format: if bit_depth <= 16 {
            SampleFormat::Int
        } else {
            SampleFormat::Int
        },
    };

    let mut writer = WavWriter::create(path, spec).context("Failed to create WAV file")?;

    let frame_count = buffer.frame_count();
    match bit_depth {
        16 => {
            for i in 0..frame_count {
                for ch in 0..buffer.channels {
                    let sample = buffer.samples[ch][i];
                    let sample_i16 = (sample.clamp(-1.0, 1.0) * 32767.0) as i16;
                    writer.write_sample(sample_i16)?;
                }
            }
        }
        24 => {
            for i in 0..frame_count {
                for ch in 0..buffer.channels {
                    let sample = buffer.samples[ch][i];
                    let sample_i32 = (sample.clamp(-1.0, 1.0) * 8388607.0) as i32;
                    writer.write_sample(sample_i32)?;
                }
            }
        }
        32 => {
            for i in 0..frame_count {
                for ch in 0..buffer.channels {
                    let sample = buffer.samples[ch][i];
                    let sample_i32 = (sample.clamp(-1.0, 1.0) * 2147483647.0) as i32;
                    writer.write_sample(sample_i32)?;
                }
            }
        }
        _ => anyhow::bail!("Unsupported bit depth: {}", bit_depth),
    }

    writer.finalize()?;
    Ok(())
}

/// Write audio buffer to MP3 file
pub fn write_mp3_file(buffer: &AudioBuffer, path: &Path, bitrate: u32) -> Result<()> {
    use mp3lame_encoder::{Builder, FlushNoGap, InterleavedPcm};
    use std::io::Write;

    let mut mp3_encoder = Builder::new().context("Failed to create MP3 encoder")?;
    mp3_encoder
        .set_num_channels(buffer.channels as u8)
        .context("Failed to set channels")?;
    mp3_encoder
        .set_sample_rate(buffer.sample_rate)
        .context("Failed to set sample rate")?;
    mp3_encoder
        .set_brate(mp3lame_encoder::Bitrate::Kbps320)
        .context("Failed to set bitrate")?;
    mp3_encoder
        .set_quality(mp3lame_encoder::Quality::Best)
        .context("Failed to set quality")?;

    let mut encoder = mp3_encoder.build().context("Failed to build MP3 encoder")?;

    // Interleave samples
    let frame_count = buffer.frame_count();
    let mut interleaved = Vec::with_capacity(frame_count * buffer.channels);
    for i in 0..frame_count {
        for ch in 0..buffer.channels {
            // Convert f32 to i16
            let sample = (buffer.samples[ch][i].clamp(-1.0, 1.0) * 32767.0) as i16;
            interleaved.push(sample);
        }
    }

    let input = InterleavedPcm(&interleaved);
    let mut mp3_out = Vec::with_capacity(frame_count);
    mp3_out.resize(frame_count * 2, 0u8);

    let encoded_size = encoder
        .encode(input, &mut mp3_out)
        .context("Failed to encode MP3")?;

    // Flush encoder
    let flush_size = encoder
        .flush::<FlushNoGap>(&mut mp3_out[encoded_size..])
        .context("Failed to flush MP3 encoder")?;

    mp3_out.truncate(encoded_size + flush_size);

    // Write to file
    let mut file = File::create(path).context("Failed to create MP3 file")?;
    file.write_all(&mp3_out)?;

    Ok(())
}

/// Read WAV file using hound (for simpler cases)
pub fn read_wav_file(path: &Path) -> Result<AudioBuffer> {
    let reader = hound::WavReader::open(path).context("Failed to open WAV file")?;
    let spec = reader.spec();

    let channels = spec.channels as usize;
    let sample_rate = spec.sample_rate;

    let mut buffer = AudioBuffer::new(channels, sample_rate);

    match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Int, 16) => {
            let samples: Vec<i16> = reader
                .into_samples::<i16>()
                .filter_map(|s| s.ok())
                .collect();
            for (i, sample) in samples.iter().enumerate() {
                let ch = i % channels;
                buffer.samples[ch].push(*sample as f32 / 32768.0);
            }
        }
        (SampleFormat::Int, 24) | (SampleFormat::Int, 32) => {
            let samples: Vec<i32> = reader
                .into_samples::<i32>()
                .filter_map(|s| s.ok())
                .collect();
            let max_val = if spec.bits_per_sample == 24 {
                8388608.0
            } else {
                2147483648.0
            };
            for (i, sample) in samples.iter().enumerate() {
                let ch = i % channels;
                buffer.samples[ch].push(*sample as f32 / max_val);
            }
        }
        (SampleFormat::Float, _) => {
            let samples: Vec<f32> = reader
                .into_samples::<f32>()
                .filter_map(|s| s.ok())
                .collect();
            for (i, sample) in samples.iter().enumerate() {
                let ch = i % channels;
                buffer.samples[ch].push(*sample);
            }
        }
        _ => anyhow::bail!(
            "Unsupported WAV format: {:?} {}bit",
            spec.sample_format,
            spec.bits_per_sample
        ),
    }

    Ok(buffer)
}
