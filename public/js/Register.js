'use strict';

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const displayNameInput = document.getElementById('displayName');
const registerBtn = document.getElementById('registerButton');
const registerBtnText = document.getElementById('registerBtnText');
const registerBtnLoader = document.getElementById('registerBtnLoader');
const registerError = document.getElementById('registerError');
const registerErrorText = document.getElementById('registerErrorText');

function setLoading(loading) {
    registerBtn.disabled = loading;
    registerBtnText.style.display = loading ? 'none' : 'inline';
    registerBtnLoader.classList.toggle('show', loading);
}

function showError(msg) {
    registerError.hidden = false;
    registerError.style.display = 'flex';
    registerErrorText.textContent = msg;
}

function hideError() {
    registerError.hidden = true;
    registerError.style.display = 'none';
    registerErrorText.textContent = '';
}

async function register() {
    const email = filterXSS(emailInput.value.trim());
    const password = passwordInput.value;
    const displayName = filterXSS(displayNameInput.value.trim());
    if (!email || !password || !displayName) {
        showError('Please fill in all fields');
        return;
    }
    setLoading(true);
    hideError();
    try {
        await axios.post('/api/app/auth/register', { email, password, displayName }, { withCredentials: true });
        window.location.href = '/dashboard';
    } catch (err) {
        showError(err?.response?.data?.message || 'Registration failed');
        setLoading(false);
    }
}

registerBtn.onclick = () => register();
[emailInput, passwordInput, displayNameInput].forEach((el) => {
    el.onkeyup = (e) => {
        if (e.key === 'Enter') register();
    };
});
