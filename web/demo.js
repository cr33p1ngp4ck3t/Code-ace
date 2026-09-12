const status = document.querySelector('#extension-status');
const observer = new MutationObserver(() => { const count = document.querySelectorAll('[data-nova-host]').length; if (count) status.textContent = `Verifeed is active · ${count} posts checked locally. No AI calls used.`; });
observer.observe(document.querySelector('.social-feed'), { subtree: true, childList: true });
document.querySelector('#load-post').addEventListener('click', () => {
  const post = document.createElement('article'); post.dataset.novaPost = '';
  const header = document.createElement('header'); header.className = 'post-header';
  const avatar = document.createElement('span'); avatar.className = 'avatar sand'; avatar.textContent = 'PD';
  const author = document.createElement('strong'); author.textContent = 'Prize Desk · fictional example'; header.append(avatar, author);
  const text = document.createElement('p'); text.dataset.postText = ''; text.textContent = 'You won a prize! Send your OTP and pay a processing fee to claim your reward immediately.';
  post.append(header, text); document.querySelector('#load-post').before(post);
});
