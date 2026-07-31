// =============================================================================
// GOOGLE PAY — direct Google Pay JS API integration
// -----------------------------------------------------------------------------
// Unlike Apple Pay above, DEUNA has no iframe/widget for Google Pay in this
// flow — we drive Google's own PaymentsClient directly, and only hand the
// resulting token to DEUNA at the very end.
//
// Two different systems are involved and each step below is labeled with
// which one it belongs to:
//   DEUNA STEP        — talking to DEUNA's API (merchant config, purchase)
//   GOOGLE PAY STEP    — talking to Google's PaymentsClient / payment sheet
//
// Scope of this demo: it stops once the Google Pay token is generated and
// logs it (plus the DEUNA-shaped payload). It does NOT call DEUNA's
// /purchase endpoint — that call happens in the client's own backend/app,
// using the token this demo produces.
//
// Depends on: window.log, window.setLoading (defined in index.html).
// =============================================================================

(function () {
  const startBtn = document.getElementById('startBtnGoogle');

  // ---- Persist form fields in localStorage so demos don't require re-typing ----
  const STORAGE_KEYS = {
    apiKeyGoogle: 'deuna_gpay_api_key',
    amountGoogle: 'deuna_gpay_amount',
    currencyGoogle: 'deuna_gpay_currency',
    countryGoogle: 'deuna_gpay_country',
    envGoogle: 'deuna_gpay_env',
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

  document.getElementById('clearStorageGoogle').addEventListener('click', () => {
    Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    document.getElementById('apiKeyGoogle').value = '';
    document.getElementById('amountGoogle').value = '100';
    document.getElementById('currencyGoogle').value = 'MXN';
    document.getElementById('countryGoogle').value = 'MX';
    document.getElementById('envGoogle').value = 'sandbox';
    document.getElementById('gpay-button').innerHTML = '';
    log('info', 'gpay:storage:cleared');
  });

  // ---- Flow state, shared across the functions below ----
  let paymentsClient = null;
  let paymentMethodConfig = null;
  let apiKeyValue = '';
  let baseUrl = '';

  function apiBaseForEnv(env) {
    // DEUNA STEP — sandbox host confirmed in DEUNA docs. Production host is
    // a placeholder; confirm the real prod host with DEUNA before using
    // env=production for anything real.
    return env === 'production'
      ? 'https://api.deuna.io' // ⚠️ placeholder — confirm with DEUNA
      : 'https://api.sandbox.deuna.io';
  }

  function gpayEnvFor(env) {
    // GOOGLE PAY STEP — maps our sandbox/production toggle to the
    // environment value Google Pay's PaymentsClient expects.
    return env === 'production' ? 'PRODUCTION' : 'TEST';
  }

  // ---- Step 1: ask DEUNA which payment methods are enabled, then build the Google Pay button ----
  async function startFlow() {
    apiKeyValue = document.getElementById('apiKeyGoogle').value.trim();
    const env = document.getElementById('envGoogle').value;

    if (!apiKeyValue) {
      log('err', 'gpay:validation', 'Ingresá el DEUNA API Key.');
      return;
    }
    if (typeof google === 'undefined' || !google.payments) {
      log('err', 'gpay:sdk-error', 'El SDK de Google Pay todavía no cargó. Esperá un segundo y reintentá.');
      return;
    }

    baseUrl = apiBaseForEnv(env);
    setLoading(startBtn, true, 'Cargar métodos de pago');
    log('info', 'gpay:fetch:payment-methods', { baseUrl });

    try {
      // DEUNA STEP — fetch the merchant's enabled payment methods. Tells us
      // whether google_pay is active and gives us the gateway/merchant
      // credentials needed to build the Google Pay request.
      const response = await fetch(`${baseUrl}/merchants/stores/payments-methods`, {
        method: 'GET',
        headers: {
          'X-API-KEY': apiKeyValue,
          'x-store-code': 'all',
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const data = await response.json();
      log('ok', 'gpay:payment-methods:ok', data);

      // DEUNA STEP — the endpoint wraps the methods array inside a `data`
      // property ({ data: [...] }). Fall back to treating the payload
      // itself as the array/object in case that ever changes.
      const methods = Array.isArray(data) ? data : Array.isArray(data.data) ? data.data : data;

      const googlePayMethod = Array.isArray(methods)
        ? methods.find((m) => m.processor_name === 'google_pay' || m.payment_provider === 'google_pay')
        : methods.processor_name === 'google_pay' || methods.payment_provider === 'google_pay'
        ? methods
        : null;

      if (!googlePayMethod) {
        throw new Error('No se encontró un método de pago google_pay habilitado para este merchant/API key.');
      }

      paymentMethodConfig = googlePayMethod;
      log('ok', 'gpay:config-found', paymentMethodConfig);

      // GOOGLE PAY STEP — create the PaymentsClient. Main entry point of the
      // Google Pay JS API; everything else (isReadyToPay, createButton,
      // loadPaymentData) is called on this instance.
      paymentsClient = new google.payments.api.PaymentsClient({
        environment: gpayEnvFor(env),
      });

      // GOOGLE PAY STEP — check whether this browser/device can actually
      // pay with Google Pay before showing the button (avoids a dead-end
      // click for the demo audience).
      const isReadyResult = await paymentsClient.isReadyToPay(buildIsReadyToPayRequest());
      log('info', 'gpay:isReadyToPay', isReadyResult);

      if (!isReadyResult.result) {
        log('err', 'gpay:not-ready', 'Este navegador/dispositivo no puede pagar con Google Pay.');
        setLoading(startBtn, false, 'Cargar métodos de pago');
        return;
      }

      // GOOGLE PAY STEP — render the official Google Pay button. Google
      // requires using their button (styling/branding rules); you can't
      // build your own from scratch.
      const button = paymentsClient.createButton({
        onClick: onGooglePayClicked,
        buttonColor: 'black',
        buttonType: 'pay',
      });

      const mount = document.getElementById('gpay-button');
      mount.innerHTML = '';
      mount.appendChild(button);

      log('ok', 'gpay:button:rendered');
      setLoading(startBtn, false, 'Recargar métodos de pago');
    } catch (error) {
      log('err', 'gpay:startFlow:error', error && error.message ? error.message : error);
      setLoading(startBtn, false, 'Cargar métodos de pago');
    }
  }

  function buildIsReadyToPayRequest() {
    // GOOGLE PAY STEP — minimal request describing which auth methods and
    // card networks we're willing to accept; used only for the readiness
    // check, not the actual payment sheet.
    const o = paymentMethodConfig.extra_params;
    return {
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [
        {
          type: 'CARD',
          parameters: {
            allowedAuthMethods: o.allowed_auth_methods,
            allowedCardNetworks: o.allowed_card_networks,
          },
        },
      ],
    };
  }

  // ---- Step 2: build the PaymentDataRequest Google Pay needs to open its sheet ----
  function buildPaymentRequest() {
    // DEUNA STEP — pull the gateway + merchant credentials DEUNA gave us in
    // step 1, so Google Pay knows how to tokenize the card for DEUNA's
    // gateway specifically.
    const r = paymentMethodConfig.credentials;
    const o = paymentMethodConfig.extra_params;
    const isDirect = o.gateway === 'DIRECT';

    // GOOGLE PAY STEP — tokenizationSpecification tells Google Pay HOW to
    // encrypt/tokenize the card: DIRECT (Google encrypts straight to us
    // with our public key) vs PAYMENT_GATEWAY (Google hands the token to a
    // named gateway, here DEUNA, using their merchant id).
    const tokenizationSpecification = isDirect
      ? {
          type: 'DIRECT',
          parameters: {
            protocolVersion: 'ECv2',
            publicKey: r.public_api_key,
          },
        }
      : {
          type: 'PAYMENT_GATEWAY',
          parameters: {
            gateway: o.gateway,
            gatewayMerchantId: r.external_merchant_id,
          },
        };

    const amount = document.getElementById('amountGoogle').value.trim() || '0';
    const currency = document.getElementById('currencyGoogle').value.trim() || 'MXN';
    const country = document.getElementById('countryGoogle').value.trim() || 'MX';

    // GOOGLE PAY STEP — full PaymentDataRequest: which card types we
    // accept, how to tokenize, who the merchant is, and the transaction
    // amount shown to the user in the Google Pay sheet.
    return {
      apiVersion: 2,
      apiVersionMinor: 0,
      allowedPaymentMethods: [
        {
          type: 'CARD',
          parameters: {
            allowedAuthMethods: o.allowed_auth_methods,
            allowedCardNetworks: o.allowed_card_networks,
          },
          tokenizationSpecification,
        },
      ],
      merchantInfo: {
        merchantId: r.external_merchant_id,
        merchantName: o.merchant_name || 'DEUNA Merchant',
      },
      transactionInfo: {
        totalPriceStatus: 'FINAL',
        totalPrice: amount,
        currencyCode: currency,
        countryCode: country,
      },
    };
  }

  // DEUNA STEP — DEUNA doesn't want Google Pay's raw paymentData shape; it
  // wants a flat { type, values: { system, encrypted_data } } object.
  // - `system` is Google's tokenization type (DIRECT vs PAYMENT_GATEWAY),
  //   taken from paymentMethodData.tokenizationData.type.
  // - `encrypted_data` is the raw token string exactly as Google Pay
  //   returned it (still a JSON-encoded string, not re-parsed) — DEUNA
  //   needs it byte-for-byte to verify the signature on their side.
  function mapToDeunaPayload(paymentData) {
    const tokenizationData = paymentData.paymentMethodData.tokenizationData;
    return {
      type: 'google_pay',
      values: {
        system: tokenizationData.type,
        encrypted_data: tokenizationData.token,
      },
    };
  }

  // ---- Step 3: user clicks the Google Pay button ----
  function onGooglePayClicked() {
    // GOOGLE PAY STEP — loadPaymentData opens Google's native payment sheet
    // (card picker + auth). Resolves with a tokenized payment method, never
    // the real card number.
    const request = buildPaymentRequest();
    log('info', 'gpay:loadPaymentData:request', request);

    paymentsClient
      .loadPaymentData(request)
      .then((paymentData) => {
        // GOOGLE PAY STEP — full object returned by loadPaymentData(): card
        // metadata (network, last4, assurance details) plus the
        // tokenization payload used to actually charge the card.
        log('ok', 'gpay:paymentData', paymentData);

        // GOOGLE PAY STEP — this demo's scope ends here: log the raw token.
        const token = paymentData.paymentMethodData.tokenizationData.token;
        log('ok', 'gpay:token', token);

        // DEUNA STEP — reshape Google Pay's paymentData into the payload
        // DEUNA expects for a card_wallet/google_pay payment_source. The
        // actual /purchase call happens outside this demo.
        const deunaPayload = mapToDeunaPayload(paymentData);
        log('ok', 'gpay:deuna-payload', deunaPayload);
      })
      .catch((err) => {
        // GOOGLE PAY STEP — user closed the sheet, no cards available,
        // network error, etc. Comes straight from the Google Pay API.
        log('err', 'gpay:loadPaymentData:error', err);
      });
  }

  startBtn.addEventListener('click', startFlow);
})();