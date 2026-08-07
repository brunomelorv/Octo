import { Mp3Encoder } from '@breezystack/lamejs'

/**
 * Converts recorded audio to MP3.
 *
 * Huggy validates uploads by content and only accepts a short list of formats. Verified against
 * the live account: mp3 is taken (it answers `type: audio` and hosts the file), while wav is
 * refused with "Arquivo inválido" despite being listed in their docs — and webm, which is the
 * only thing Chrome's MediaRecorder produces, is refused too. So the browser has to transcode
 * before the file leaves it.
 *
 * Mono at 22.05 kHz and 64 kbps: speech stays perfectly clear and a minute of audio lands around
 * 500 KB, well inside the upload cap.
 */

const TARGET_SAMPLE_RATE = 22050
const BITRATE_KBPS = 64
/** lamejs wants small blocks; 1152 samples is one MP3 frame. */
const SAMPLES_PER_FRAME = 1152

/** Averages channels into one and resamples by linear interpolation. */
function toMonoAtTargetRate(buffer: AudioBuffer): Int16Array {
  const channels = buffer.numberOfChannels
  const source = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c))
  const ratio = buffer.sampleRate / TARGET_SAMPLE_RATE
  const length = Math.floor(buffer.length / ratio)
  const out = new Int16Array(length)

  for (let i = 0; i < length; i++) {
    const position = i * ratio
    const left = Math.floor(position)
    const right = Math.min(left + 1, buffer.length - 1)
    const weight = position - left

    let sample = 0
    for (let c = 0; c < channels; c++) {
      sample += source[c][left] * (1 - weight) + source[c][right] * weight
    }
    sample /= channels

    // Clamp before scaling: a value beyond ±1 would wrap around and turn into a loud click.
    const clamped = Math.max(-1, Math.min(1, sample))
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return out
}

export async function audioToMp3(blob: Blob): Promise<Blob> {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
  const context = new AudioCtx()
  try {
    // decodeAudioData understands whatever the browser just recorded, webm/opus included.
    const decoded = await context.decodeAudioData(await blob.arrayBuffer())
    const samples = toMonoAtTargetRate(decoded)

    const encoder = new Mp3Encoder(1, TARGET_SAMPLE_RATE, BITRATE_KBPS)
    const chunks: Uint8Array[] = []
    for (let i = 0; i < samples.length; i += SAMPLES_PER_FRAME) {
      const frame = encoder.encodeBuffer(samples.subarray(i, i + SAMPLES_PER_FRAME))
      if (frame.length) chunks.push(frame)
    }
    const tail = encoder.flush()
    if (tail.length) chunks.push(tail)

    return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
  } finally {
    // Every recording opens a context; leaving them behind eventually exhausts the browser's
    // limit and getUserMedia starts failing.
    context.close()
  }
}
