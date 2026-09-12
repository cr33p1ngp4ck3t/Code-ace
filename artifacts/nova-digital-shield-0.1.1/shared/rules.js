/* Shared by classic extension content scripts and the studio/server. No network calls. */
(() => {
  const labels = {
    en: { low: 'No obvious warning signs', caution: 'Pause and check', high: 'Strong scam warning signs', unknown: 'Not enough information' },
    ur: { low: 'کوئی واضح خطرہ نظر نہیں آیا', caution: 'رکیں اور تصدیق کریں', high: 'دھوکے کی مضبوط نشانیاں', unknown: 'معلومات کافی نہیں ہیں' }
  };
  const words = {
    credentials: /\b(otp|one.?time (?:password|code)|password|pin|recovery phrase|seed phrase|verification code)\b|او ٹی پی|پاس ورڈ|پن کوڈ/i,
    request: /\b(send|share|give|provide|enter|confirm|reply with|tell me|dm|verify)\b|بھیج|بتائیں|شیئر|درج کریں/i,
    employment: /\b(job|internship|hiring|recruitment|vacancy|employment|work from home)\b|نوکری|ملازمت|انٹرن شپ/i,
    fee: /\b(registration fee|processing fee|security deposit|advance payment|upfront|pay (?:a |the |your )?(?:fee|deposit)|deposit (?:rs|pkr)|send (?:rs|pkr))\b|رجسٹریشن فیس|پہلے پیسے|سیکیورٹی فیس/i,
    prize: /\b(won|winner|prize|lottery|giveaway|reward)\b|انعام|لاٹری/i,
    returns: /\b(guaranteed (?:profit|returns?|income)|double your money|risk.free (?:profit|investment)|\d+% (?:daily|per day))\b|پیسے ڈبل|گارنٹی منافع/i,
    money: /\b(invest|investment|profit|deposit|money|crypto|bitcoin|pkr|rs)\b|پیسے|سرمایہ|منافع/i,
    urgent: /\b(act now|urgent|immediately|last chance|expires? (?:today|in)|account.{0,20}(?:suspended|blocked)|within \d+ (?:minutes|hours))\b|فوری|اکاؤنٹ بند|جلدی کریں/i,
    click: /\b(click|log.?in|sign.?in|verify|claim|apply)\b|کلک|لاگ ان|تصدیق/i,
    safety: /\b(?:never|do not|don['’]t|avoid)\s+(?:ever\s+)?(?:share|send|give|provide|enter|pay|click|trust|reveal)\b|\b(?:beware|scam awareness|how to spot)\b|کبھی نہ|مت بھیج|شیئر نہ|ہوشیار|نہ کریں/i
  };
  const feeRequested = text => words.fee.test(text.replace(/\b(?:no|without|zero)\s+(?:(?:registration|processing|application) fee|advance payment|upfront payment)\b/gi, ''));
  const rules = [
    { id: 'credentials', when: s => words.credentials.test(s) && words.request.test(s), weight: 80,
      en: ['Asks for a private code or password', 'Sharing a login code can give someone access to your account.', 'Do not share your code. Contact the organization through its official app.'],
      ur: ['خفیہ کوڈ یا پاس ورڈ مانگا گیا ہے', 'لاگ ان کوڈ دینے سے کوئی آپ کے اکاؤنٹ تک پہنچ سکتا ہے۔', 'اپنا کوڈ نہ دیں۔ ادارے کی اصل ایپ سے رابطہ کریں۔'] },
    { id: 'job-fee', when: s => words.employment.test(s) && feeRequested(s), weight: 75,
      en: ['A job offer asks for money first', 'An advance fee tied to a job or internship is a warning sign.', 'Pause the payment. Verify the offer on the employer’s official website.'],
      ur: ['نوکری کے لیے پہلے پیسے مانگے گئے ہیں', 'نوکری یا انٹرن شپ کے لیے پہلے فیس مانگنا خطرے کی نشانی ہے۔', 'ادائیگی روکیں۔ ادارے کی اصل ویب سائٹ پر پیشکش کی تصدیق کریں۔'] },
    { id: 'prize-fee', when: s => words.prize.test(s) && feeRequested(s), weight: 75,
      en: ['A prize requires an advance payment', 'Paying a fee to receive a supposed prize is a warning sign.', 'Do not pay to claim this prize. Check with the organizer independently.'],
      ur: ['انعام کے لیے پہلے ادائیگی مانگی گئی ہے', 'انعام حاصل کرنے کے لیے فیس مانگنا خطرے کی نشانی ہے۔', 'انعام کے لیے پیسے نہ دیں۔ منتظم سے الگ رابطہ کریں۔'] },
    { id: 'returns', when: s => words.returns.test(s) && words.money.test(s), weight: 75,
      en: ['Promises guaranteed or unusually fast returns', 'Claims like doubling money or risk-free profit deserve careful checking.', 'Pause. Ask someone you trust and check the organization independently.'],
      ur: ['یقینی یا بہت تیز منافع کا وعدہ ہے', 'پیسے ڈبل کرنے یا بغیر خطرے کے منافع کا دعویٰ مشکوک ہے۔', 'رکیں۔ کسی قابل اعتماد شخص سے مشورہ کریں اور ادارے کی تصدیق کریں۔'] }
  ];
  function scan(input = {}) {
    const language = input.language === 'ur' ? 'ur' : 'en';
    const text = String(input.text || '').normalize('NFKC').slice(0, 6000);
    const links = [...new Set([...(Array.isArray(input.links) ? input.links : []), ...(text.match(/https?:\/\/[^\s<>"']+/gi) || [])])].filter(x => typeof x === 'string').slice(0, 8);
    const sentences = text.split(/(?<=[.!?۔\n])\s+/).filter(s => !words.safety.test(s));
    // Adjacent non-educational sentences may contain the offer and fee separately.
    const candidate = sentences.join(' ');
    const reasons = [];
    let score = 0;
    for (const rule of rules) {
      if (rule.when(candidate)) {
        const [title, detail, action] = rule[language];
        reasons.push({ id: rule.id, title, detail, action, evidence: (sentences.find(rule.when) || candidate).slice(0, 220) });
        score += rule.weight;
      }
    }
    if (words.urgent.test(candidate) && words.click.test(candidate) && links.length) {
      reasons.push({ id: 'pressure-link', title: language === 'ur' ? 'لنک کھولنے کے لیے دباؤ ہے' : 'Pressure to follow a link quickly', detail: language === 'ur' ? 'جلدی کا دباؤ تصدیق کا وقت کم کر سکتا ہے۔' : 'Time pressure can make it harder to verify a request.', action: language === 'ur' ? 'پیغام کے لنک کی جگہ اصل ایپ خود کھولیں۔' : 'Open the official app yourself instead of using the message’s link.', evidence: candidate.slice(0, 220) });
      score += 35;
    }
    for (const link of links) {
      try {
        const url = new URL(link);
        if (!/^https?:$/.test(url.protocol)) continue;
        if (url.username || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes('xn--')) {
          reasons.push({ id: 'unusual-link', title: language === 'ur' ? 'لنک کے پتے کو غور سے دیکھیں' : 'The link address needs a closer look', detail: language === 'ur' ? 'یہ پتہ شناخت کرنا مشکل بنا سکتا ہے۔ یہ اکیلا دھوکے کا ثبوت نہیں ہے۔' : 'This address uses a format that can obscure its destination. This alone is not proof of a scam.', action: language === 'ur' ? 'اصل ویب سائٹ کا پتہ خود لکھیں۔' : 'Type the organization’s official address yourself.', evidence: url.hostname.slice(0, 180) });
          score += 30;
          break;
        }
      } catch { /* Invalid links are not evidence of a scam. */ }
    }
    const media = Boolean(input.hasMedia);
    let risk = score >= 70 ? 'high' : score >= 25 ? 'caution' : 'low';
    if (!score && (media || text.trim().length < 15)) risk = 'unknown';
    const action = reasons[0]?.action || (language === 'ur' ? 'کسی دعوے پر عمل کرنے سے پہلے اصل ذریعے سے تصدیق کریں۔' : 'Check the original source before acting on a claim.');
    return { risk, headline: labels[language][risk], reasons: reasons.slice(0, 4), action, source: 'local', language, authenticity: 'unverified', coverage: { text: Boolean(text.trim()), images: 0, audioSeconds: 0, videoFrames: 0, mediaUnchecked: media }, cached: false };
  }
  globalThis.NovaRules = Object.freeze({ scan, labels });
})();
