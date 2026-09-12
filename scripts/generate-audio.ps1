$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$novaAssetDirectory = Join-Path $PSScriptRoot '..\web\assets'
$novaAssetDirectory = [System.IO.Path]::GetFullPath($novaAssetDirectory)
$novaSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$novaSpeaker.Rate = -1
$novaAudioFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
try {
  $novaSpeaker.SetOutputToWaveFile((Join-Path $novaAssetDirectory 'sample-audio.wav'), $novaAudioFormat)
  $novaSpeaker.Speak('Hello. This is the account support desk. Your account will be blocked today. Please send your one time password to verify your account immediately. Do not delay.')
  $novaSpeaker.SetOutputToNull()
  $novaSpeaker.SetOutputToWaveFile((Join-Path $novaAssetDirectory 'video-speech.wav'), $novaAudioFormat)
  $novaSpeaker.Speak('Congratulations! You won our weekly prize. Pay a processing fee to claim your reward today.')
} finally { $novaSpeaker.Dispose() }
Write-Output 'Generated two fictional English practice clips using the device voice.'
