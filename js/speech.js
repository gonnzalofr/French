// French text-to-speech for the dictée, using the browser's built-in voices.
// Voices installed on the computer ("local") work offline; online voices need internet.

export function speechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Resolves with French voices once the browser has loaded its voice list. */
export function frenchVoices() {
  if (!speechSupported()) return Promise.resolve([]);
  const pick = () => speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith("fr"));
  const now = pick();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(pick());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

/** Preferred voice: the saved one, else a local fr-FR voice, else any French voice. */
export function chooseVoice(voices, savedName) {
  return (
    voices.find((v) => v.name === savedName) ??
    voices.find((v) => v.localService && v.lang === "fr-FR") ??
    voices.find((v) => v.lang === "fr-FR") ??
    voices[0] ??
    null
  );
}

export function speak(text, { voice = null, rate = 0.9 } = {}) {
  if (!speechSupported()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? "fr-FR";
  if (voice) u.voice = voice;
  u.rate = rate;
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (speechSupported()) speechSynthesis.cancel();
}
