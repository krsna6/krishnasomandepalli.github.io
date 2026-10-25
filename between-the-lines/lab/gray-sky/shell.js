// The shared shell of the Gray sky studies: her voice, a clock that follows it, the controls, and the
// word-lit caption. A study supplies { reset(), stepTo(seconds), render(seconds), resize(w, h) } and the
// shell drives it: physics runs in fixed steps up to the voice's clock, so a word's push lands on the word.
import { VOICE } from "./voice.js";

export { VOICE };

const $ = (id) => document.getElementById(id);

/** The sentences of the text, each with the words that fall inside it (word index ranges). */
function sentences() {
  const text = VOICE.text;
  const out = [];
  const re = /[^.!?]+(?:\.\.\.|[.!?])?\s*/g;
  let m;
  while ((m = re.exec(text))) {
    if (!m[0].trim()) continue;
    const c0 = m.index, c1 = m.index + m[0].length;
    const ws = VOICE.words.map((w, i) => [w, i]).filter(([w]) => w.c0 >= c0 && w.c0 < c1).map(([, i]) => i);
    if (ws.length) out.push({ c0, c1, from: ws[0], to: ws[ws.length - 1] });
  }
  return out;
}

export function runStudy(study) {
  window.__caption = (T) => caption(T);
  const audio = new Audio();
  audio.preload = "auto";
  audio.src = "../voice.m4a";
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}

  // the caption: one sentence at a time, each word lit as she says it
  const S = sentences();
  const cap = $("cap");
  let shownSentence = -1;
  let spans = [];
  function caption(T) {
    let k = S.findIndex((s, i) => T < (VOICE.words[S[i + 1]?.from]?.s ?? Infinity) - 0.05);
    if (k < 0) k = S.length - 1;
    if (k !== shownSentence) {
      shownSentence = k;
      cap.replaceChildren();
      spans = [];
      for (let i = S[k].from; i <= S[k].to; i++) {
        const sp = document.createElement("span");
        sp.textContent = VOICE.words[i].t;
        cap.append(sp, " ");
        spans.push([i, sp]);
      }
    }
    for (const [i, sp] of spans) sp.className = T >= VOICE.words[i].e ? "said" : T >= VOICE.words[i].s ? "now" : "";
  }

  // the clock: her audio time, smoothed between the browser's coarse updates
  let clock = 0, lastAudio = -1, lastNow = 0, prev = 0, playing = false, ended = false, endAt = 0;
  const TAIL = 4; // the physics keeps settling this long after her last word
  function tick(now) {
    if (playing) {
      const a = audio.currentTime;
      if (a !== lastAudio) { lastAudio = a; lastNow = now; }
      // where her voice is now: the last reported time plus the time since it was reported
      const est = ended ? VOICE.durationSec + (now - endAt) / 1000 : a + (now - lastNow) / 1000;
      clock += Math.min(0.1, (now - prev) / 1000);
      if (Math.abs(est - clock) > 0.3) clock = est; else clock += (est - clock) * 0.12;
      if (ended && clock >= VOICE.durationSec + TAIL) { playing = false; $("bPlay").textContent = "Play again"; }
    }
    prev = now;
    if (!window.__freeze) { // (the test harness freezes the clock to look at chosen moments)
      study.stepTo(clock);
      study.render(clock);
      caption(clock);
    }
    requestAnimationFrame(tick);
  }

  function restart() {
    audio.pause();
    audio.currentTime = 0;
    clock = 0; lastAudio = -1; ended = false;
    study.reset();
  }
  function play() {
    if (ended || clock >= VOICE.durationSec) restart();
    playing = true;
    $("bPlay").textContent = "Pause";
    audio.play().catch(() => { playing = false; $("bPlay").textContent = "Play"; });
  }
  function pause() { playing = false; audio.pause(); $("bPlay").textContent = "Play"; }
  audio.addEventListener("ended", () => { ended = true; endAt = performance.now(); });

  $("begin").addEventListener("click", () => { $("start").classList.add("gone"); play(); });
  $("bPlay").addEventListener("click", () => (playing ? pause() : play()));
  $("bRestart").addEventListener("click", () => { restart(); play(); });
  $("bCap").addEventListener("click", () => { const off = cap.classList.toggle("off"); $("bCap").textContent = off ? "Words: off" : "Words: on"; });
  addEventListener("keydown", (e) => { if (e.key === " ") { e.preventDefault(); playing ? pause() : play(); } });

  const fit = () => study.resize(innerWidth, innerHeight);
  addEventListener("resize", fit);
  fit();
  study.reset();
  requestAnimationFrame(tick);
}

/** The words her voice is inside at time t (usually one, sometimes none). */
export function wordsAt(t) {
  const out = [];
  for (const w of VOICE.words) { if (w.s > t) break; if (t <= w.e) out.push(w); }
  return out;
}
