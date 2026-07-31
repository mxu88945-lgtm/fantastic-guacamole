import fs from 'node:fs'
import vm from 'node:vm'

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8')
const helperStart = html.indexOf('function joinVoiceText(')
const helperEnd = html.indexOf('function speechRecognitionClass(', helperStart)
if (helperStart < 0 || helperEnd < 0) throw new Error('voice helper section not found')

const context = {}
vm.runInNewContext(
  `${html.slice(helperStart, helperEnd)}
   globalThis.voiceHelpers = { joinVoiceText, voiceAudioExtension, voiceTranscriptionUrl };`,
  context,
)
const { joinVoiceText, voiceAudioExtension, voiceTranscriptionUrl } = context.voiceHelpers

const equal = (actual, expected, name) => {
  if (actual !== expected) throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

equal(joinVoiceText('', ' 你好 '), '你好', 'empty draft')
equal(joinVoiceText('我想说', '你好'), '我想说你好', 'Chinese draft append')
equal(joinVoiceText('hello', 'world'), 'hello world', 'Latin draft append')
equal(joinVoiceText('已经有空格 ', '继续'), '已经有空格 继续', 'existing whitespace')
equal(voiceAudioExtension('audio/mp4;codecs=mp4a.40.2'), 'm4a', 'iPhone audio extension')
equal(voiceAudioExtension('audio/webm;codecs=opus'), 'webm', 'Chromium audio extension')
equal(
  voiceTranscriptionUrl('https://api.openai.com/v1/'),
  'https://api.openai.com/v1/audio/transcriptions',
  'versioned STT base URL',
)
equal(
  voiceTranscriptionUrl('https://voice.example.com'),
  'https://voice.example.com/v1/audio/transcriptions',
  'root STT base URL',
)
equal(
  voiceTranscriptionUrl('https://voice.example.com/v1/audio/transcriptions'),
  'https://voice.example.com/v1/audio/transcriptions',
  'full STT endpoint',
)

const voiceStart = html.indexOf('async function toggleVoiceInput(')
const voiceEnd = html.indexOf('async function speakText(', voiceStart)
if (voiceStart < 0 || voiceEnd < 0) throw new Error('voice toggle section not found')
const toggleSource = html.slice(voiceStart, voiceEnd)
if (/\bsend\s*\(/.test(toggleSource)) throw new Error('voice input must not auto-send')
if (!html.includes('$("voice-input-btn").onclick = toggleVoiceInput;')) throw new Error('voice button is not wired')
if (!sw.includes('const CACHE = "role-chat-cache-v109";')) throw new Error('service worker cache was not bumped')

console.log('voice input regression: 13 checks passed')
