/**
 * YatraSathi — Public Marketing Website Client Script
 * Stack: Native Vanilla JavaScript (ES6+)
 * Provides mobile menu toggle, accessible modal management, destination filtering,
 * smooth scrolling, and user feedback notices.
 */

(function () {
  'use strict';

  // --- 1. DOM Elements ---
  const siteHeader = document.getElementById('site-header');
  const mobileToggle = document.getElementById('mobile-toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = document.querySelectorAll('.nav-link');
  
  // Modal Elements
  const authModal = document.getElementById('auth-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const tabSignupBtn = document.getElementById('tab-signup-btn');
  const tabSigninBtn = document.getElementById('tab-signin-btn');
  const modalTitle = document.getElementById('modal-title');
  const modalDesc = document.getElementById('modal-desc');
  const nameGroup = document.getElementById('name-group');
  const userNameInput = document.getElementById('user-name');
  const authForm = document.getElementById('auth-form');
  const authSubmitBtn = document.getElementById('auth-submit-btn');
  const openAuthBtns = document.querySelectorAll('.btn-open-auth');

  // Destination Filtering Elements
  const filterTabs = document.querySelectorAll('.filter-tab');
  const destinationCards = document.querySelectorAll('.destination-card');

  // Toast Notification Elements
  const toastNotice = document.getElementById('toast-notice');
  const toastMessage = document.getElementById('toast-message');
  let toastTimeout = null;

  // Track focused element before modal opened for accessibility
  let lastFocusedElement = null;

  // --- 2. Mobile Navigation Toggle ---
  function initMobileNav() {
    if (!mobileToggle || !navMenu) return;

    mobileToggle.addEventListener('click', function () {
      const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      mobileToggle.setAttribute('aria-expanded', !isExpanded);
      navMenu.classList.toggle('open');
      document.body.style.overflow = !isExpanded ? 'hidden' : '';
    });

    // Close menu when a navigation link is clicked
    navLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        if (navMenu.classList.contains('open')) {
          mobileToggle.setAttribute('aria-expanded', 'false');
          navMenu.classList.remove('open');
          document.body.style.overflow = '';
        }
      });
    });

    // Close on Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) {
        mobileToggle.setAttribute('aria-expanded', 'false');
        navMenu.classList.remove('open');
        document.body.style.overflow = '';
        mobileToggle.focus();
      }
    });
  }

  // --- 3. Header Scroll Effect ---
  function initHeaderScroll() {
    if (!siteHeader) return;

    window.addEventListener('scroll', function () {
      if (window.scrollY > 20) {
        siteHeader.classList.add('scrolled');
      } else {
        siteHeader.classList.remove('scrolled');
      }
    }, { passive: true });
  }

  // Development-only API origin when UI runs on Live Server (port 5500); empty string (same-origin) in production & Wrangler
  function getApiBase() {
    const host = window.location.hostname;
    if ((host === '127.0.0.1' || host === 'localhost') && window.location.port === '5500') {
      return `http://${host}:8787`;
    }
    return '';
  }

  // --- 4. Accessible Auth Modal Management ---
  function clearAuthErrors() {
    const formErr = document.getElementById('auth-form-error');
    if (formErr) {
      formErr.textContent = '';
      formErr.hidden = true;
    }
    ['user-name', 'user-email', 'user-password'].forEach(function (id) {
      const input = document.getElementById(id);
      const errEl = document.getElementById(id + '-error');
      if (input) {
        input.classList.remove('is-invalid');
        input.removeAttribute('aria-invalid');
      }
      if (errEl) errEl.textContent = '';
    });
  }

  function setFieldError(inputId, message) {
    const input = document.getElementById(inputId);
    const errEl = document.getElementById(inputId + '-error');
    if (input) {
      input.classList.add('is-invalid');
      input.setAttribute('aria-invalid', 'true');
    }
    if (errEl) errEl.textContent = message;
  }

  function setAuthMode(mode) {
    clearAuthErrors();
    const passwordInput = document.getElementById('user-password');
    const forgotBtn = document.getElementById('btn-open-forgot-password');
    const forgotForm = document.getElementById('forgot-password-form');
    if (forgotForm) forgotForm.style.display = 'none';
    if (authForm) authForm.style.display = 'block';

    if (mode === 'signin') {
      tabSigninBtn.classList.add('active');
      tabSigninBtn.setAttribute('aria-selected', 'true');
      tabSignupBtn.classList.remove('active');
      tabSignupBtn.setAttribute('aria-selected', 'false');

      modalTitle.textContent = 'Welcome Back to YatraSathi';
      modalDesc.textContent = 'Sign in to access your private trips, itineraries, and booking notes.';
      nameGroup.style.display = 'none';
      userNameInput.removeAttribute('required');
      if (forgotBtn) forgotBtn.style.display = 'inline-block';
      if (passwordInput) passwordInput.setAttribute('autocomplete', 'current-password');
      authSubmitBtn.textContent = 'Sign In to Workspace';
    } else {
      tabSignupBtn.classList.add('active');
      tabSignupBtn.setAttribute('aria-selected', 'true');
      tabSigninBtn.classList.remove('active');
      tabSigninBtn.setAttribute('aria-selected', 'false');

      modalTitle.textContent = 'Start Your Travel Workspace';
      modalDesc.textContent = 'Join YatraSathi to start planning private itineraries across India.';
      nameGroup.style.display = 'block';
      userNameInput.setAttribute('required', 'required');
      if (forgotBtn) forgotBtn.style.display = 'none';
      if (passwordInput) passwordInput.setAttribute('autocomplete', 'new-password');
      authSubmitBtn.textContent = 'Create Free Account';
    }
  }

  function openModal(mode = 'signup') {
    if (!authModal) return;

    lastFocusedElement = document.activeElement;
    setAuthMode(mode);

    authModal.classList.add('open');
    authModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Focus first input
    const firstInput = mode === 'signin' ? document.getElementById('user-email') : userNameInput;
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }

  function closeModal() {
    if (!authModal) return;

    authModal.classList.remove('open');
    authModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    if (lastFocusedElement) {
      lastFocusedElement.focus();
    }
  }

  function initAuthModal() {
    if (!authModal) return;

    // Trigger buttons
    openAuthBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        const mode = btn.getAttribute('data-mode') || 'signup';
        // If mobile nav is open, close it first
        if (navMenu && navMenu.classList.contains('open')) {
          mobileToggle.setAttribute('aria-expanded', 'false');
          navMenu.classList.remove('open');
          document.body.style.overflow = '';
        }
        openModal(mode);
      });
    });

    // Close button
    if (modalCloseBtn) {
      modalCloseBtn.addEventListener('click', closeModal);
    }

    // Backdrop click close
    authModal.addEventListener('click', function (e) {
      if (e.target === authModal) {
        closeModal();
      }
    });

    // Tab switching + ArrowLeft/ArrowRight keyboard support
    if (tabSignupBtn && tabSigninBtn) {
      tabSignupBtn.addEventListener('click', function () {
        setAuthMode('signup');
      });
      tabSigninBtn.addEventListener('click', function () {
        setAuthMode('signin');
      });
      [tabSignupBtn, tabSigninBtn].forEach(function (tabBtn) {
        tabBtn.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const nextTab = tabBtn === tabSignupBtn ? tabSigninBtn : tabSignupBtn;
            setAuthMode(nextTab === tabSignupBtn ? 'signup' : 'signin');
            nextTab.focus();
          }
        });
      });
    }

    // Escape key & Tab focus-trap inside open modal
    document.addEventListener('keydown', function (e) {
      if (!authModal || !authModal.classList.contains('open')) return;
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = Array.from(
          authModal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
        ).filter(function (el) {
          return el.offsetParent !== null;
        });
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Clear individual field error on input
    ['user-name', 'user-email', 'user-password'].forEach(function (id) {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', function () {
          input.classList.remove('is-invalid');
          input.removeAttribute('aria-invalid');
          const errEl = document.getElementById(id + '-error');
          if (errEl) errEl.textContent = '';
          const formErr = document.getElementById('auth-form-error');
          if (formErr) formErr.hidden = true;
        });
      }
    });

    // Form submit feedback & Better Auth (Cloudflare Workers + D1) integration
    if (authForm) {
      authForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        clearAuthErrors();

        const emailInput = document.getElementById('user-email');
        const passwordInput = document.getElementById('user-password');
        const nameInput = document.getElementById('user-name');
        const email = emailInput ? emailInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const displayName = nameInput ? nameInput.value.trim() : '';
        const isSignUp = tabSignupBtn.classList.contains('active');

        let firstInvalid = null;
        if (isSignUp && !displayName) {
          setFieldError('user-name', 'Please enter your full name.');
          firstInvalid = firstInvalid || nameInput;
        }
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setFieldError('user-email', 'Please enter a valid email address.');
          firstInvalid = firstInvalid || emailInput;
        }
        if (isSignUp && password.length < 8) {
          setFieldError('user-password', 'Password must be at least 8 characters.');
          firstInvalid = firstInvalid || passwordInput;
        } else if (!isSignUp && !password) {
          setFieldError('user-password', 'Please enter your password.');
          firstInvalid = firstInvalid || passwordInput;
        }

        if (firstInvalid) {
          firstInvalid.focus();
          return;
        }

        // Better Auth (Cloudflare Workers + D1)
        try {
          authSubmitBtn.disabled = true;
          authSubmitBtn.textContent = 'Authenticating...';
          const endpoint = getApiBase() + (isSignUp ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email');
          const payload = isSignUp
            ? { name: displayName, email: email, password: password }
            : { email: email, password: password };

          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
          });
          const contentType = resp.headers.get('content-type') || '';
          const data = contentType.includes('application/json') ? await resp.json().catch(() => ({})) : {};
          if (!resp.ok) {
            if (!contentType.includes('application/json') && (resp.status === 404 || resp.status === 405)) {
              throw new Error('Auth API unavailable on this port. Open the local Wrangler server (http://127.0.0.1:8787/index.html).');
            }
            throw new Error(data.message || data.error || 'Authentication failed. Please verify your details.');
          }

          showToast(isSignUp ? `Account created for ${email}! Entering workspace...` : `Signed in as ${email}! Entering workspace...`);
          closeModal();
          setTimeout(function () {
            window.location.href = 'app.html';
          }, 500);
        } catch (err) {
          authSubmitBtn.disabled = false;
          authSubmitBtn.textContent = isSignUp ? 'Create Free Account' : 'Sign In to Workspace';
          const formErr = document.getElementById('auth-form-error');
          if (formErr) {
            formErr.textContent = err.message || 'Unable to authenticate. Ensure the Cloudflare Worker backend is running.';
            formErr.hidden = false;
          }
          showToast(`Authentication Error: ${err.message}`);
        }
      });
    }

    // Forgot Password Inline Flow (Anti-Enumeration HTTP 202)
    const btnOpenForgot = document.getElementById('btn-open-forgot-password');
    const btnBackSignin = document.getElementById('btn-back-signin');
    const forgotForm = document.getElementById('forgot-password-form');
    const forgotEmailInput = document.getElementById('forgot-email');
    const forgotStatusMsg = document.getElementById('forgot-status-msg');
    const btnSendReset = document.getElementById('btn-send-reset');

    if (btnOpenForgot && forgotForm && authForm) {
      btnOpenForgot.addEventListener('click', function () {
        clearAuthErrors();
        authForm.style.display = 'none';
        forgotForm.style.display = 'block';
        modalTitle.textContent = 'Reset Your Password';
        modalDesc.textContent = 'Enter your email address and we will process a password reset if an account exists.';
        if (forgotStatusMsg) forgotStatusMsg.style.display = 'none';
        if (forgotEmailInput) {
          const signinEmail = document.getElementById('user-email');
          if (signinEmail && signinEmail.value) forgotEmailInput.value = signinEmail.value;
          setTimeout(() => forgotEmailInput.focus(), 60);
        }
      });
    }

    if (btnBackSignin && forgotForm && authForm) {
      btnBackSignin.addEventListener('click', function () {
        setAuthMode('signin');
      });
    }

    if (forgotForm) {
      forgotForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = forgotEmailInput ? forgotEmailInput.value.trim() : '';
        const errEl = document.getElementById('forgot-email-error');
        if (errEl) errEl.textContent = '';
        if (forgotEmailInput) forgotEmailInput.classList.remove('is-invalid');

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
          if (forgotEmailInput) forgotEmailInput.classList.add('is-invalid');
          if (errEl) errEl.textContent = 'Please enter a valid email address.';
          if (forgotEmailInput) forgotEmailInput.focus();
          return;
        }

        if (btnSendReset) {
          btnSendReset.disabled = true;
          btnSendReset.textContent = 'Processing...';
        }
        try {
          const resp = await fetch(getApiBase() + '/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.status === 400 && errEl) {
            errEl.textContent = 'Please enter a valid email address.';
          } else if (forgotStatusMsg) {
            forgotStatusMsg.textContent = data.message || 'If an account exists for that email, a password reset email has been processed.';
            forgotStatusMsg.style.display = 'block';
          }
        } catch {
          if (forgotStatusMsg) {
            forgotStatusMsg.textContent = 'If an account exists for that email, a password reset email has been processed.';
            forgotStatusMsg.style.display = 'block';
          }
        } finally {
          if (btnSendReset) {
            btnSendReset.disabled = false;
            btnSendReset.textContent = 'Send Reset Email';
          }
        }
      });
    }

    // Complete Password Reset (?resetToken=...)
    const resetForm = document.getElementById('reset-password-form');
    const resetNewPassInput = document.getElementById('reset-new-password');
    const resetStatusMsg = document.getElementById('reset-status-msg');
    const btnCompleteReset = document.getElementById('btn-complete-reset');
    const urlParams = new URLSearchParams(window.location.search);
    const resetTokenFromUrl = urlParams.get('resetToken');

    const authErrorFromUrl = urlParams.get('error');
    if (authErrorFromUrl && authForm) {
      openModal('signin');
      const errMsg = authErrorFromUrl === 'account_not_linked'
        ? 'An account with this email already exists and is unverified. Google cannot be linked until that email is verified (email verification is currently unavailable because no email sender is configured). Please sign in with your email and password, or use a different Google account.'
        : `Sign-in could not be completed (${authErrorFromUrl.replace(/_/g, ' ')}). Please try again.`;
      showFormError(errMsg);
    }

    if (resetTokenFromUrl && resetForm && authForm) {
      openModal('signin');
      authForm.style.display = 'none';
      if (forgotForm) forgotForm.style.display = 'none';
      resetForm.style.display = 'block';
      modalTitle.textContent = 'Set a New Password';
      modalDesc.textContent = 'Enter a new password (at least 8 characters) for your YatraSathi account.';

      resetForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const newPassword = resetNewPassInput ? resetNewPassInput.value : '';
        if (newPassword.length < 8) {
          if (resetStatusMsg) {
            resetStatusMsg.textContent = 'Password must be at least 8 characters.';
            resetStatusMsg.style.display = 'block';
          }
          return;
        }
        if (btnCompleteReset) {
          btnCompleteReset.disabled = true;
          btnCompleteReset.textContent = 'Updating...';
        }
        try {
          const resp = await fetch(getApiBase() + '/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetTokenFromUrl, newPassword })
          });
          const data = await resp.json().catch(() => ({}));
          if (resetStatusMsg) {
            resetStatusMsg.textContent = data.message || (resp.ok ? 'Password updated.' : 'Reset link invalid or expired.');
            resetStatusMsg.style.display = 'block';
          }
          if (resp.ok) {
            window.history.replaceState({}, '', window.location.pathname);
            setTimeout(() => setAuthMode('signin'), 1400);
          }
        } catch {
          if (resetStatusMsg) {
            resetStatusMsg.textContent = 'Unable to reach server to complete password reset.';
            resetStatusMsg.style.display = 'block';
          }
        } finally {
          if (btnCompleteReset) {
            btnCompleteReset.disabled = false;
            btnCompleteReset.textContent = 'Update Password';
          }
        }
      });
    }
  }

  // --- 5. Destination Filtering ---
  function initDestinationFilters() {
    if (!filterTabs.length || !destinationCards.length) return;

    filterTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        const filter = tab.getAttribute('data-filter');

        // Update active tab state
        filterTabs.forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        // Filter cards
        destinationCards.forEach(function (card) {
          const region = card.getAttribute('data-region');
          if (filter === 'all' || region === filter) {
            card.style.display = 'flex';
            card.style.opacity = '1';
          } else {
            card.style.display = 'none';
            card.style.opacity = '0';
          }
        });
      });
    });
  }

  // --- 6. Toast Notification Helper ---
  function showToast(message) {
    if (!toastNotice || !toastMessage) return;

    toastMessage.textContent = message;
    toastNotice.classList.add('show');

    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }

    toastTimeout = setTimeout(function () {
      toastNotice.classList.remove('show');
    }, 4500);
  }

  // --- 7. Initialize All Modules ---
  document.addEventListener('DOMContentLoaded', function () {
    initMobileNav();
    initHeaderScroll();
    initAuthModal();
    initDestinationFilters();

    const btnGoogle = document.getElementById('btn-google-signin');
    if (btnGoogle) {
      btnGoogle.addEventListener('click', async function () {
        btnGoogle.disabled = true;
        const originalText = btnGoogle.textContent;
        btnGoogle.textContent = 'Connecting to Google...';
        try {
          const resp = await fetch(getApiBase() + '/api/auth/sign-in/social', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              provider: 'google',
              callbackURL: '/app.html',
              errorCallbackURL: '/index.html'
            })
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data && data.url) {
            window.location.href = data.url;
            return;
          }
          showToast((data && data.message) || 'Google Sign-In is not configured on this environment yet.');
        } catch (err) {
          showToast('Google Sign-In requires the Cloudflare Worker backend.');
        } finally {
          btnGoogle.disabled = false;
          btnGoogle.textContent = originalText;
        }
      });
    }
  });
})();
