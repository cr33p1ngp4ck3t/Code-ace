(() => {
  const copy = {
    en: {
      title: 'AI writing & quality', signals: 'Possible AI-style writing', unclear: 'No clear AI-style signals', insufficient: 'Too little text to assess', disclosed: 'AI writing disclosed',
      note: 'Writing patterns cannot prove who or what wrote a post. Human writing can share these patterns; AI writing can avoid them.',
      template_language: ['Stock phrasing', 'Several familiar promotional phrases make the writing feel formulaic.'],
      repetition: ['Repetitive structure', 'The same wording or sentence pattern is repeated.'],
      generic_claims: ['Generic claims', 'Broad praise or promises add little specific, checkable detail.'],
      assistant_artifact: ['Assistant-like wording', 'This resembles an assistant response left in the post; it may also be a quotation.'],
      disclosure: ['AI use mentioned', 'The text says AI helped write it. That statement has not been independently verified.']
    },
    ur: {
      title: 'اے آئی تحریر اور معیار', signals: 'ممکنہ اے آئی جیسا انداز', unclear: 'اے آئی انداز کی واضح نشانیاں نہیں', insufficient: 'جانچ کے لیے متن کم ہے', disclosed: 'اے آئی تحریر کا ذکر',
      note: 'تحریر کا انداز مصنف کی شناخت کا ثبوت نہیں۔ انسان بھی ایسا لکھ سکتے ہیں اور اے آئی مختلف انداز اپنا سکتا ہے۔',
      template_language: ['عام سانچے کے فقرے', 'کئی عام تشہیری فقرے تحریر کو سانچے جیسا بناتے ہیں۔'],
      repetition: ['بار بار ایک ہی انداز', 'الفاظ یا جملوں کا انداز دہرایا گیا ہے۔'],
      generic_claims: ['غیر واضح دعوے', 'عمومی تعریف یا وعدوں میں جانچنے کے لیے ٹھوس تفصیل کم ہے۔'],
      assistant_artifact: ['معاون جیسی عبارت', 'یہ عبارت اے آئی معاون کے جواب جیسی ہے؛ یہ اقتباس بھی ہو سکتی ہے۔'],
      disclosure: ['اے آئی استعمال کا ذکر', 'متن میں اے آئی سے لکھنے کا ذکر ہے۔ اس بیان کی الگ تصدیق نہیں ہوئی۔']
    }
  };
  const codes = ['template_language', 'repetition', 'generic_claims', 'assistant_artifact', 'disclosure'];
  const fold = value => value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
  function result(status, signals, language, source = 'local') {
    const w = copy[language] || copy.en;
    return { status, headline: w[status], signals, limitation: w.note, authorship: 'unverified', source };
  }
  function signal(code, evidence, language) {
    const w = copy[language] || copy.en;
    return { code, title: w[code][0], detail: w[code][1], evidence: evidence.slice(0, 240) };
  }
  function scan(text = '', language = 'en') {
    text = String(text).slice(0, 6000);
    // Awareness posts and quotations of detector cues are not author disclosures.
    const discussing = /\b(?:ai detectors?|detecting ai|ai detection|example of|quote|quotation|people say|never assume)\b|اے آئی کی شناخت/iu.test(text);
    const disclosure = text.match(/\b(?:I (?:used|use) (?:ChatGPT|AI) to (?:write|draft) (?:this|my) (?:post|text|caption)|this (?:post|text|caption) (?:was |is )?(?:written|generated|drafted) (?:by|with) (?:AI|ChatGPT))\b/iu);
    if (!discussing && disclosure) return result('disclosed', [signal('disclosure', disclosure[0], language)], language);
    const artifact = text.match(/(?:^|[.!?]\s+)(as an AI (?:language )?model[^.!?]{0,100}|certainly[!,]?\s+here(?:'s| is) (?:a|an|the|your) (?:polished|revised|rewritten|draft)[^.!?]{0,100})/iu);
    if (!discussing && artifact) return result('signals', [signal('assistant_artifact', artifact[1], language)], language);
    if (text.trim().length < 180) return result('insufficient', [], language);
    const signals = [];
    const phrases = [...text.matchAll(/\b(?:in today's (?:fast-paced|ever-evolving|digital) (?:world|landscape)|unlock (?:the|your) (?:power|potential)|game[- ]changer|delve into|seamlessly (?:integrate|blend)|ever-evolving landscape|revolutionize the way)\b/giu)];
    if (!discussing && new Set(phrases.map(match => fold(match[0]))).size >= 3) signals.push(signal('template_language', phrases[0][0], language));
    const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [];
    const starts = new Map();
    for (const sentence of sentences) {
      const start = sentence.trim().split(/\s+/u).slice(0, 4).join(' ');
      if (start.length < 12) continue;
      const key = fold(start); starts.set(key, (starts.get(key) || 0) + 1);
      if (starts.get(key) === 3) { signals.push(signal('repetition', start, language)); break; }
    }
    // These observations describe style, never a scam score or an AI probability.
    return result(signals.length ? 'signals' : 'unclear', signals, language);
  }
  function normalize(raw, text = '', language = 'en') {
    const local = scan(text, language);
    if (local.status === 'disclosed' || local.status === 'insufficient') return { ...local, source: 'ai' };
    const signals = [], seen = new Set();
    for (const item of Array.isArray(raw?.signals) ? raw.signals.slice(0, 6) : []) {
      if (!codes.includes(item?.code) || item.code === 'disclosure' || typeof item.evidence !== 'string') continue;
      const evidence = item.evidence.trim().slice(0, 240);
      if (evidence.length < 8 || !fold(text).includes(fold(evidence)) || seen.has(item.code)) continue;
      signals.push(signal(item.code, evidence, language)); seen.add(item.code);
    }
    if (signals.length < 2 && !signals.some(item => item.code === 'assistant_artifact')) return { ...local, source: 'ai' };
    return result('signals', signals.slice(0, 3), language, 'ai');
  }
  globalThis.VerifeedWriting = Object.freeze({ scan, normalize, copy });
})();
