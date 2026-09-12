(() => {
  function scan(input = {}) {
    const language = input.language === 'ur' ? 'ur' : 'en';
    const local = NovaRules.scan({ ...input, links: [], language });
    // Normal sign-in pages ask users to enter a password. That is not, by itself,
    // evidence of phishing. Retain explicit requests to share a secret with others.
    const sharing = /\b(?:send|share|give|reply with|tell me|dm)\b[^.!?\n]{0,100}\b(?:otp|one.?time (?:password|code)|password|pin|recovery phrase|seed phrase|verification code)\b|(?:بھیج|شیئر|بتائیں)[^۔\n]{0,100}(?:او ٹی پی|پاس ورڈ|پن کوڈ)/iu;
    const reasons = local.reasons.filter(reason => reason.id !== 'credentials' || sharing.test(reason.evidence));
    const high = reasons.some(reason => ['credentials', 'job-fee', 'prize-fee', 'returns'].includes(reason.id));
    const risk = high ? 'high' : reasons.length ? 'caution' : local.coverage.text ? 'low' : 'unknown';
    const writing = VerifeedWriting.scan(input.text || '', language);
    const warningKind = ['high', 'caution'].includes(risk) ? risk : ['signals', 'disclosed'].includes(writing.status) ? 'writing' : null;
    return { ...local, risk, reasons, headline: NovaRules.labels[language][risk], action: reasons[0]?.action || (language === 'ur' ? 'کسی دعوے پر عمل سے پہلے اصل ذریعے سے تصدیق کریں۔' : 'Check the original source before acting on a claim.'), writing, warningKind };
  }
  globalThis.VerifeedWebsite = Object.freeze({ scan });
})();
