// =============================================================================
// APPLE PAY — DEUNA Payment Widget
// -----------------------------------------------------------------------------
// This flow uses DEUNA's own Web SDK (loaded in index.html as DeunaSDK).
// DEUNA renders the entire payment UI inside an iframe for us — Apple Pay
// shows up automatically as one of the payment methods if:
//   1. Apple Pay is enabled for this merchant in the DEUNA Dashboard, and
//   2. the domain hosting this page is verified with Apple through DEUNA
//      (the .well-known/apple-developer-merchantid-domain-association file).
//
// Unlike Google Pay, we never touch card data, tokens, or Apple's payment
// sheet directly — DEUNA's widget and callbacks are the entire interface.
// Depends on: window.log, window.setLoading (defined in index.html).
// =============================================================================

(function () {
  const payBtn = document.getElementById('payBtnApple');

  // ---- Persist form fields in localStorage so demos don't require re-typing ----
  const STORAGE_KEYS = {
    apiKeyApple: 'deuna_apple_public_api_key',
    orderTokenApple: 'deuna_apple_order_token',
    envApple: 'deuna_apple_env',
  };

  function restoreSavedValues() {
    Object.entries(STORAGE_KEYS).forEach(([field, key]) => {
      const saved = localStorage.getItem(key);
      if (saved !== null) {
        const el = document.getElementById(field);
        if (el) el.value = saved;
      }
    });
  }

  function wireAutoSave() {
    Object.entries(STORAGE_KEYS).forEach(([field, key]) => {
      const el = document.getElementById(field);
      if (!el) return;
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, (e) => localStorage.setItem(key, e.target.value));
    });
  }

  restoreSavedValues();
  wireAutoSave();

  document.getElementById('clearStorageApple').addEventListener('click', () => {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    document.getElementById('apiKeyApple').value = '';
    document.getElementById('orderTokenApple').value = '';
    document.getElementById('envApple').value = 'sandbox';
    log('info', 'apple:storage:cleared');
  });

  // ---- Main flow: initialize the SDK, then mount the payment widget ----
  payBtn.addEventListener('click', async () => {
    const publicApiKey = document.getElementById('apiKeyApple').value.trim();
    const orderToken = document.getElementById('orderTokenApple').value.trim();
    const env = document.getElementById('envApple').value;

    if (!publicApiKey || !orderToken) {
      log('err', 'apple:validation', 'Completá el Public API Key y el Order Token antes de pagar.');
      return;
    }

    if (typeof DeunaSDK === 'undefined') {
      log('err', 'apple:sdk-error', 'DeunaSDK no está cargado todavía. Esperá un segundo y reintentá.');
      return;
    }

    setLoading(payBtn, true, 'Pagar');
    log('info', 'apple:init', { env });

    try {
      // DEUNA STEP — set up the SDK with the merchant's public key and target
      // environment. Has to run before initPaymentWidget.
      await DeunaSDK.initialize({
        publicApiKey,
        env,
      });
      log('ok', 'apple:initialize:ok');

      // If Apple Pay is available, it should return it within an array, such as: ["APPLE_PAY"]
      const available = await DeunaSDK.getWalletsAvailable();
      log('available? : ', available)
      log ('available.includes("APPLE_PAY") ', available.includes('APPLE_PAY'),' o ', available.includes('apple_pay'))

      // DEUNA STEP — mount the payment widget for a specific order. The
      // `paymentMethods` filter below restricts the widget to just Apple Pay
      // (card_wallet / apple_pay) — remove it to show all methods enabled
      // for the merchant instead.

      if (available.includes('APPLE_PAY')) {
        // Render button for Apple Pay and append a listener (EXAMPLE)
        btn.addEventListener('click', () => {
          DeunaSDK.initPaymentWidget({
            orderToken,
            /*
            paymentMethods: [
              {
                paymentMethod: 'card_wallet',
                processors: ['apple_pay'],
                configuration: {
                  // express: true // uncomment for auto-purchase / one-tap flow
                },
              },
            ],
            */
            callbacks: {
              // DEUNA STEP — fires when the widget detects a card BIN as the
              // user types (not relevant to Apple Pay itself, but part of the
              // same widget callback surface).
              onCardBinDetected: () => {
                log('neutral', 'apple:onCardBinDetected');
              },

              // DEUNA STEP — user closed the widget without completing payment.
              onClosed: (action) => {
                log('neutral', 'apple:onClosed', action);
                setLoading(payBtn, false, 'Pagar');
              },

              // DEUNA STEP — payment failed. Payload has DEUNA's error detail.
              onError: (payload) => {
                log('err', 'apple:onError', payload);
                setLoading(payBtn, false, 'Pagar');
              },

              // DEUNA STEP — user picked an installment plan (if enabled).
              onInstallmentSelected: (payload) => {
                log('neutral', 'apple:onInstallmentSelected', payload);
              },

              // DEUNA STEP — payment submitted, waiting on the processor/Apple.
              onPaymentProcessing: () => {
                log('info', 'apple:onPaymentProcessing');
              },

              // DEUNA STEP — payment succeeded. We explicitly close the widget
              // afterwards — DEUNA doesn't auto-close it for us.
              onSuccess: async (payload) => {
                log('ok', 'apple:onSuccess', payload);
                try {
                  await DeunaSDK.close();
                  log('ok', 'apple:widget:closed');
                } catch (closeError) {
                  log('err', 'apple:close:error', closeError && closeError.message ? closeError.message : closeError);
                }
                setLoading(payBtn, false, 'Pagar');
              },

              // DEUNA STEP — catch-all event stream from the widget (analytics,
              // step tracking, etc). Useful for debugging things not covered by
              // the callbacks above.
              onEventDispatch: (type, data) => {
                log('neutral', 'apple:event:' + type, data);
              },
            },
          });
        });
      } else {
        console.error('Apple Pay is not available on this device.');
      }



      log('ok', 'apple:widget:mounted');
      setLoading(payBtn, false, 'Pagar');
    } catch (error) {
      log('err', 'apple:exception', error && error.message ? error.message : error);
      setLoading(payBtn, false, 'Pagar');
    }
  });
})();