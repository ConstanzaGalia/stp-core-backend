<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo_text.svg" width="320" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Test

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## Variables de entorno (STP)

Copiá [`.env.example`](./.env.example) a `.env` y completá credenciales.

- **`DB_POOL_MAX`**: conexiones máximas del pool **por instancia** del backend. En Postgres detrás de un pooler en modo **Session** (p. ej. Supabase) el cupo global es compartido: si desplegás varias réplicas, `réplicas × DB_POOL_MAX` no debe superar el límite del proveedor. Si aparece el error `MaxClientsInSessionMode`, bajá `DB_POOL_MAX` (p. ej. 3–5) o reducí instancias.

### Demo pública y leads (`/public/demo`, `/admin/demo-leads`)

Tablas: `sql/create-demo-leads.sql` (o la migración `1752600000000-AddDemoLeads`).

- **`DEMO_LEADS_NOTIFY_EMAIL`**: a quién avisar cuando entra un lead nuevo. Admite varios, separados por coma. Sin esta variable no se manda el aviso, pero el lead se guarda igual.
- **`FRONTEND_URL`** (ya existente): se usa para el link "Ver todos los leads" del aviso.
- **`TRUST_PROXY_HOPS`**: cantidad de proxies delante del backend, para leer la IP real del visitante en el límite de pedidos. En Railway se asume `1` automáticamente.
- **`DEMO_LEAD_TOKEN_SECRET`** (opcional): clave del token de la demo. Si falta, se deriva de `SECRET_JWT`.
- **`META_PIXEL_ID`** y **`META_CAPI_ACCESS_TOKEN`**: Conversions API de Meta. Si falta alguna de las dos, no se envía nada.
- **`META_CAPI_TEST_EVENT_CODE`** (opcional): código de prueba del Administrador de eventos de Meta, para verificar los envíos sin afectar las métricas.
- **`META_GRAPH_API_VERSION`** (opcional, default `v22.0`).

### Alta self-service con prueba gratuita (`POST /company` con `signupPlan`)

Columna nueva: `company.trial_ends_at` (`sql/add-company-trial-ends-at.sql` o la migración `1752700000000-AddCompanyTrial`).

- Con `signupPlan` (`STP_PERSONAL` | `STP_CENTER` | `personal` | `center`) el centro nace activo con prueba, el usuario `TRAINER` pasa a `DIRECTOR` y se crea la suscripción PAID del plan con sus cargos pendientes (suscripción + onboarding; migración solo si `includeMigration: true` en Center). Sin `signupPlan` el comportamiento no cambia (centro inactivo, sin prueba).
- Pasado `trial_ends_at` la API responde `403 COMPANY_TRIAL_EXPIRED` hasta que se marque como pagado el cargo de onboarding (eso limpia `trial_ends_at` y pasa el lead de la demo a `customer`).
- **`PLATFORM_TRIAL_DAYS`** (opcional, default `14`): duración de la prueba.
- **`PLATFORM_BILLING_NOTIFY_EMAIL`**: a quién avisar cuando un centro sube un comprobante. Admite varios, separados por coma. Sin esta variable no se manda el aviso.

## License

Nest is [MIT licensed](LICENSE).
