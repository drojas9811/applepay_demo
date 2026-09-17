# Deploy de applepay_demo con GitHub OIDC

El workflow se instala en `.github/workflows/deploy.yml` del repositorio.
Se ejecuta al hacer push a master o manualmente desde Actions sobre master.
No crea infraestructura ni modifica la lógica de pagos. No necesita claves AWS permanentes.

## 1. Infraestructura (una sola vez, desde tu sesión AWS)

- Crear un bucket dedicado, por ejemplo en us-east-1, con Block Public Access activado y Object Ownership Bucket owner enforced (sin ACL).
- Usar cifrado SSE-S3; las políticas adjuntas no incluyen permisos KMS.
- Crear una distribución CloudFront con el endpoint S3 normal como origen, no el endpoint de static website hosting.
- Configurar Origin Access Control (OAC), firmando siempre las solicitudes al origen.
- Default root object: index.html. Viewer protocol policy: Redirect HTTP to HTTPS.
- Métodos GET y HEAD. Cache policy: Managed-CachingOptimized.
- Usar el dominio asignado y certificado predeterminado de CloudFront. No se necesita Route 53 ni dominio propio.
- Aplicar bucket-policy.json al bucket, sustituyendo BUCKET_NAME, ACCOUNT_ID y DISTRIBUTION_ID. Si el bucket ya tiene políticas, integrar la nueva declaración sin borrar las anteriores.
- La creación inicial del bucket, distribución, OAC y rol se hace con tus permisos administrativos existentes; no conceder esos permisos al workflow.

## 2. IAM para GitHub Actions

- En IAM > Identity providers, crear (o reutilizar) el proveedor OpenID Connect:
  - URL: https://token.actions.githubusercontent.com
  - Audience: sts.amazonaws.com
- Crear un rol IAM con trust-policy.json, sustituyendo ACCOUNT_ID.
- Adjuntar deploy-policy.json al rol, sustituyendo BUCKET_NAME, ACCOUNT_ID y DISTRIBUTION_ID.
- La confianza autoriza solo drojas9811/applepay_demo y la rama master.
- Este workflow no usa un GitHub Environment. Si añades uno, hay que adaptar el claim sub de la política de confianza.

## 3. Variables de GitHub

Settings > Secrets and variables > Actions > Variables:

| Variable | Valor |
|---|---|
| AWS_REGION | Región del bucket, por ejemplo us-east-1 |
| AWS_ROLE_ARN | ARN del rol IAM creado |
| S3_BUCKET | Nombre del bucket, sin s3:// |
| CLOUDFRONT_DISTRIBUTION_ID | ID de la distribución |

Estos valores son identificadores, no secretos. OIDC emite credenciales temporales automáticamente. No crear ni compartir access keys para este workflow.

## 4. Publicación y comprobación

Hacer commit/push del workflow a master cuando la infraestructura y variables estén listas.
Sube solamente index.html, apple-pay.js, google-pay.js y el archivo de asociación sin extensión.
No borra objetos existentes. Invalida las cinco rutas afectadas y espera la propagación.

Verificar en el dominio asignado:

```sh
curl -sS -D - -o /dev/null https://DISTRIBUTION_DOMAIN/.well-known/apple-developer-merchantid-domain-association
```

Debe responder 200 y Content-Type: text/plain; charset=utf-8, sin redirección de esa URL HTTPS.
Comprobar también que el cuerpo coincide con el archivo local; registrar/verificar el nuevo dominio mediante DEUNA.

## Permisos recurrentes

- GitHub: contents: read e id-token: write.
- IAM del workflow: s3:PutObject solo sobre los cuatro objetos; cloudfront:CreateInvalidation y cloudfront:GetInvalidation solo sobre la distribución.
- CloudFront: s3:GetObject mediante política del bucket restringida al ARN de la distribución.
- No necesita s3:ListBucket, s3:DeleteObject, ACL, administración CloudFront ni Route 53.

## Validación pendiente

Los archivos se han preparado localmente. La primera ejecución real y la validación HTTP requieren que existan el bucket, la distribución y el rol, y que se configuren las variables del repositorio.
