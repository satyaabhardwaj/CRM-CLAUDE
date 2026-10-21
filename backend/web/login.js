const form = document.getElementById('login');
const button = document.getElementById('submit');
const message = document.getElementById('message');
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (button.disabled) return;
  button.disabled = true; message.textContent = 'Signing in…';
  try {
    const response = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not sign in.');
    document.getElementById('password').value = '';
    window.location.assign('/');
  } catch (error) { message.textContent = error.message || 'Connection unavailable. Try again.'; }
  finally { button.disabled = false; }
});
document.getElementById('logout').onclick = async () => { await fetch('/api/auth/logout',{method:'POST'}); window.location.reload(); };
fetch('/api/auth/me').then(r=>{if(r.ok)document.getElementById('logout').hidden=false;}).catch(()=>{});
