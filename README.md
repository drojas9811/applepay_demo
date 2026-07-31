# DEUNA Wallet Tester

Demo estático para probar **Apple Pay** (vía el Payment Widget de DEUNA) y
**Google Pay** (integración directa con la Google Pay JS API) desde un mismo
lugar, con un toggle para pasar de uno a otro y un panel de logs compartido.

Pensado para usar en demos con clientes: no requiere backend, no requiere
build, son 3 archivos que se suben tal cual a cualquier hosting estático.

## Archivos

```
index.html      → shell de la página: toggle, inputs de cada wallet, panel de logs
apple-pay.js    → lógica de Apple Pay (DEUNA Web SDK / Payment Widget)
google-pay.js   → lógica de Google Pay (Google Pay JS API + mapeo a DEUNA)
```

Los tres archivos tienen que viajar juntos, en la misma carpeta — `index.html`
los referencia por ruta relativa (`<script src="apple-pay.js">`, etc).

## Cómo correrlo

1. Subí los 3 archivos a un hosting estático con **HTTPS** (Apple Pay lo
   exige). Opciones gratis recomendadas: **Netlify** o **Cloudflare Pages**.
   *(GitHub Pages funciona para Google Pay, pero para Apple Pay puede dar
   problemas con el archivo de verificación de dominio — ver más abajo.)*
2. Abrí la URL publicada.
3. Elegí la pestaña **Apple Pay** o **Google Pay** arriba.
4. Completá los campos de esa pestaña y hacé click en el botón de pago.
5. Mirá el panel **Logs** al final de la página (o la consola del navegador,
   F12) para ver cada paso del flujo en tiempo real.

## Apple Pay — qué necesitás cargar

| Campo | De dónde sale |
|---|---|
| Public API Key | DEUNA Dashboard → credenciales del merchant |
| Order Token | Se genera al crear una orden con la API de DEUNA (no lo genera este demo) |
| Entorno | `sandbox` o `production` |

**Importante:** Apple Pay solo aparece como método de pago si:
- El navegador es **Safari** (o el flujo cross-device "Scan Code with iPhone"
  para navegadores no-Safari, si DEUNA lo tiene habilitado).
- El **dominio donde corre esta página está verificado** ante Apple a través
  de DEUNA. Esto requiere:
  1. Conseguir el archivo `apple-developer-merchantid-domain-association`
     desde el **DEUNA Dashboard**.
  2. Subirlo sin modificar a:
     ```
     https://<tu-dominio>/.well-known/apple-developer-merchantid-domain-association
     ```
  3. Confirmar que el hosting lo sirve con `Content-Type: text/plain; charset=utf-8`
     y `200 OK` (GitHub Pages sirve archivos sin extensión como
     `application/octet-stream` y **no** deja configurar headers — por eso
     se recomienda Netlify/Cloudflare Pages en vez de GitHub Pages para este
     demo).
  4. Verificar el dominio desde el DEUNA Dashboard.

## Google Pay — qué necesitás cargar

| Campo | De dónde sale |
|---|---|
| DEUNA API Key | DEUNA Dashboard → credenciales del merchant |
| Monto / Moneda / País | Los define quien corre la demo, se muestran en el sheet de Google Pay |
| Entorno | `sandbox` o `production` |

**Alcance de este demo:** el flujo llega hasta generar el **token de Google
Pay** y lo loguea (crudo + ya mapeado al formato que espera DEUNA). **No**
hace el `purchase` contra DEUNA — ese paso lo hace el backend/app del
cliente, usando el token que este demo genera.

Formato del payload ya mapeado para DEUNA:
```json
{
  "type": "google_pay",
  "values": {
    "system": "DIRECT",
    "encrypted_data": "..."
  }
}
```

**Nota sobre el host de producción:** en `google-pay.js`, la función
`apiBaseForEnv()` tiene un placeholder para el host de `production`
(`https://api.deuna.io`). Confirmá el host productivo real con DEUNA antes
de usar `env=production` en serio.

## Notas técnicas

- Cada wallet vive en su propio archivo (`apple-pay.js` / `google-pay.js`),
  envuelto en un IIFE — no comparten variables entre sí ni pisan el estado
  del otro.
- Ambos scripts comparten un logger global (`window.log`) y un helper de
  loading (`window.setLoading`), definidos inline en `index.html`.
- Los campos de cada pestaña se guardan en `localStorage` con prefijos
  distintos (`deuna_apple_*` / `deuna_gpay_*`) para no pisarse entre sí, y
  quedan solo en el navegador de quien los usa — no se comparten ni se suben
  a ningún lado.
- El toggle Apple Pay / Google Pay es puramente visual (mostrar/ocultar
  panel); no reinicializa nada, así que si cambiás de pestaña a mitad de un
  flujo, el estado de ese flujo sigue vivo hasta que recargués la página.