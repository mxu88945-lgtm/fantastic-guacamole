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
if (!html.includes('$("voice-input-btn").onclick = () => {')) throw new Error('voice button is not wired')
if (!html.includes('addEventListener("pointerdown"')) throw new Error('iPhone stop tap is not handled eagerly')
if (!html.includes('recognition.abort()')) throw new Error('stuck Safari recognition has no abort fallback')
if (!html.includes('recognition._voiceStopFallback = setTimeout')) throw new Error('recognition stop has no watchdog')
if (!html.includes('voiceInputState === "stopping"')) throw new Error('stop action has no immediate UI state')
if (!html.includes('60000')) throw new Error('voice capture has no maximum duration')
const cacheVersion = Number(sw.match(/role-chat-cache-v(\d+)/)?.[1] || 0)
if (cacheVersion < 110) throw new Error('service worker cache predates the voice stop fix')

const lifecycleStart = html.indexOf('function finishBrowserVoiceInput(')
const lifecycleEnd = html.indexOf('function startBrowserVoiceInput(', lifecycleStart)
if (lifecycleStart < 0 || lifecycleEnd < 0) throw new Error('browser recognition lifecycle section not found')
let fallback
const fakeInput = { value: '', focus() {} }
const lifecycleContext = {
  voiceRecognition: null,
  voiceInputBaseText: '',
  clearTimeout() {},
  setTimeout(fn) { fallback = fn; return 1 },
  setVoiceInputState(state) { lifecycleContext.state = state },
  showToast() {},
  $() { return fakeInput },
}
vm.runInNewContext(
  `${html.slice(lifecycleStart, lifecycleEnd)}
   globalThis.lifecycle = { finishBrowserVoiceInput, stopBrowserVoiceInput };`,
  lifecycleContext,
)
const recognition = {
  _voiceInput: fakeInput,
  _voiceBaseText: '',
  stop() { this.stopCalls = (this.stopCalls || 0) + 1 },
  abort() { this.abortCalls = (this.abortCalls || 0) + 1 },
}
lifecycleContext.voiceRecognition = recognition
lifecycleContext.lifecycle.stopBrowserVoiceInput(recognition, false)
equal(lifecycleContext.state, 'stopping', 'stop tap immediate state')
equal(recognition.stopCalls, 1, 'graceful recognition stop')
fallback()
equal(recognition.abortCalls, 1, 'Safari forced abort fallback')
equal(lifecycleContext.state, 'idle', 'fallback restores idle state')
if (lifecycleContext.voiceRecognition !== null) throw new Error('fallback did not release recognizer ownership')

console.log('voice input regression: 23 checks passed')
