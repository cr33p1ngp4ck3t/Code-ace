(() => {
  const adapters = [
    { name: 'X / Twitter', hosts: ['x.com', 'twitter.com'], posts: 'article[data-testid="tweet"]', text: '[data-testid="tweetText"]', images: '[data-testid="tweetPhoto"] img', permalink: 'a[href*="/status/"]' },
    { name: 'Facebook', hosts: ['www.facebook.com', 'facebook.com'], posts: '[role="feed"] [role="article"], [role="article"]', text: '[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"]', images: 'img', permalink: 'a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid="]' },
    { name: 'Instagram', hosts: ['www.instagram.com', 'instagram.com'], posts: 'main article, article', text: 'h1', images: 'img', permalink: 'a[href*="/p/"], a[href*="/reel/"]' },
    { name: 'LinkedIn', hosts: ['www.linkedin.com', 'linkedin.com'], posts: '[data-view-name="feed-full-update"], [data-id^="urn:li:activity:"], .feed-shared-update-v2, .occludable-update, [data-urn^="urn:li:activity:"]', text: '.update-components-text, .feed-shared-update-v2__description, .feed-shared-text', images: 'img', permalink: 'a[href*="/feed/update/"], a[href*="/posts/"]' },
    { name: 'Practice feed', hosts: ['127.0.0.1', 'localhost'], posts: '[data-nova-post]', text: '[data-post-text]', images: '[data-post-media] img, img[data-post-media]', permalink: 'a[data-post-link]' }
  ];
  function adapterFor(hostname = location.hostname) { return adapters.find(adapter => adapter.hosts.includes(hostname)) || null; }
  function extractPost(element, adapter) {
    const copy = element.cloneNode(true); copy.querySelectorAll('[data-nova-host], script, style, nav').forEach(node => node.remove());
    const textNodes = [...copy.querySelectorAll(adapter.text)];
    const text = (textNodes.length ? textNodes.map(node => node.textContent).join('\n') : copy.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 6000);
    const links = [...new Set([...element.querySelectorAll('a[href]')].map(a => a.href).filter(href => /^https?:\/\//.test(href)))].slice(0, 8);
    const media = [];
    for (const video of element.querySelectorAll('video')) media.push({ kind: 'video', src: video.currentSrc || video.src || video.querySelector('source')?.src || '' });
    for (const audio of element.querySelectorAll('audio')) media.push({ kind: 'audio', src: audio.currentSrc || audio.src || audio.querySelector('source')?.src || '' });
    for (const img of element.querySelectorAll(adapter.images)) {
      const width = img.naturalWidth || img.width || Number(img.getAttribute('width'));
      const height = img.naturalHeight || img.height || Number(img.getAttribute('height'));
      if (Math.max(width, height) < 140 || /avatar|profile (?:photo|picture)|emoji/i.test(img.alt)) continue;
      const src = img.currentSrc || img.src; if (src && !media.some(m => m.src === src)) media.push({ kind: 'image', src });
    }
    const permalink = element.querySelector(adapter.permalink)?.href || '';
    return { text, links, media: media.slice(0, 4), hasMedia: media.length > 0, permalink, platform: adapter.name };
  }
  function findPosts(root = document, adapter = adapterFor()) {
    if (!adapter) return [];
    return [...root.querySelectorAll(adapter.posts)].filter(element => !element.parentElement?.closest(adapter.posts));
  }
  globalThis.NovaAdapters = Object.freeze({ adapterFor, extractPost, findPosts });
})();
