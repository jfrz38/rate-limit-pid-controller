# Roadmap para Fastify y NestJS multiplataforma

## Objetivo

Añadir un adaptador oficial para Fastify y hacer que el adaptador NestJS funcione de forma
soportada tanto con Express como con Fastify, conservando el core Rust/WebAssembly y el host Node
como únicas fuentes de las decisiones de admisión.

Este roadmap se limita al ecosistema Node.js de este repositorio. Integraciones para la JVM u otros
runtimes quedan fuera de alcance y, si se desarrollan, pertenecerán a otro repositorio.

## Resultado esperado

Al terminar el trabajo existirán estas fronteras:

```text
adaptive-admission-controller (Rust/WebAssembly)
                    |
        @jfrz38/adaptive-admission-node
                    |
       +------------+-------------+
       |            |             |
    Express      Fastify        NestJS
                                /    \
                         Express      Fastify
```

- El host Node seguirá siendo independiente de HTTP y de los frameworks.
- Express y Fastify poseerán sus respectivos detalles de request, response, hooks y errores.
- NestJS utilizará abstracciones de Nest siempre que proporcionen las garantías necesarias y
  aislará las diferencias inevitables entre sus plataformas HTTP.
- El paquete `shared` no implementará comportamiento específico de Express bajo un nombre
  aparentemente neutral.
- Una instancia del controlador seguirá limitando únicamente su proceso o worker de Node.

## Estado de partida

El host Node expone actualmente `AdaptiveAdmissionController.run()`. El callback empieza cuando el
core admite la petición y la promesa termina cuando finaliza el trabajo. Este modelo encaja con
Express, que permite llamar a `next()` desde el callback y observar después los eventos de la
respuesta.

El código compartido y el adaptador NestJS están acoplados a Express:

- `code/adapters/shared/src/middleware/pid-controller-middleware-handler.ts` importa tipos Express
  y observa `req.aborted`, `finish`, `close` y `error`.
- `code/adapters/shared/src/filter/http-error-response.ts` escribe mediante
  `set().status().json()`.
- `code/adapters/nestjs/src/middleware/pid-controller.middleware.ts` importa `Request`, `Response`
  y `NextFunction` de Express.
- `code/adapters/nestjs/src/filter/pid-exception.filter.ts` trata la respuesta como Express.
- `code/adapters/nestjs/package.json` declara Express como peer dependency.

Por ello, NestJS sobre Fastify no se considera soportado aunque algunos objetos raw de Node puedan
coincidir accidentalmente.

## Principios e invariantes

### Invariantes

1. Una petición admitida debe comunicarse al core exactamente una vez como éxito o fallo.
2. Una petición todavía en cola debe poder cancelarse cuando el cliente se desconecta.
3. Una petición ya iniciada no se cancela en el core: el host permite que el trabajo iniciado
   finalice, de acuerdo con el contrato actual.
4. Ninguna espera de admisión debe bloquear el event loop.
5. Los errores de admisión se convierten en HTTP; los errores de configuración, protocolo o de la
   aplicación permanecen separados y se delegan al framework.
6. El shutdown rechaza trabajo nuevo, cancela trabajo en cola y permite finalizar trabajo iniciado.
7. El adaptador no debe instalar listeners sin retirarlos en todos los caminos terminales.
8. El core, el contrato WIT y el componente Wasm no deben cambiar para resolver detalles HTTP.
9. Express debe conservar su contrato público durante la incorporación de Fastify, salvo que se
   apruebe y documente expresamente una versión incompatible.

### Preferencias

- Node.js 24 o superior y ESM, siguiendo el resto del workspace.
- APIs pequeñas que reflejen conceptos de admisión, no conceptos de un framework concreto.
- Integración idiomática de cada framework en lugar de una falsa abstracción HTTP universal.
- Pruebas con servidores reales cuando el riesgo esté en hooks, eventos, desconexiones o wiring.
- Cambios incrementales; cada fase debe poder integrarse sin depender de que todo el roadmap esté
  terminado.

## Decisiones previas

Antes de implementar el adaptador se deben cerrar estas decisiones y registrarlas en el pull
request correspondiente o en una decisión breve dentro de la documentación del paquete.

### Versiones soportadas

- Elegir la versión principal de Fastify que se publicará como peer dependency. La opción inicial
  debería ser la versión estable actual compatible con Node 24.
- Decidir si se soportará más de una major de Fastify. No ampliar la matriz sin ejecutar los mismos
  tests de integración contra todas ellas.
- Mantener la matriz actual de NestJS solo si `@nestjs/platform-express` y
  `@nestjs/platform-fastify` pueden comprobarse para todas sus majors declaradas. En caso
  contrario, reducir honestamente el rango de peer dependencies.

### Semántica de finalización

Definir una matriz común antes de codificar:

| Evento observable | Resultado para el core | Respuesta HTTP |
|---|---|---|
| Respuesta enviada completamente, incluido un `4xx` o `5xx` renderizado | `success` | La aplicación conserva su respuesta |
| Error que impide completar la respuesta | `failure` | Se delega al error handler mientras la conexión permita gestionarlo |
| Rechazo por threshold | No inicia trabajo | `429` por defecto |
| Cola llena, eviction o shutdown | No inicia trabajo | `503` por defecto |
| Cliente desconectado mientras espera | Cancelación queued | No intentar responder |
| Cliente desconectado tras iniciar | `failure` | No intentar responder |
| Timeout del servidor/framework | Decidir y documentar | Respetar la política del framework |

En especial, no asumir que `close` equivale siempre a éxito. En Node una respuesta puede cerrar
antes de `finish`; los tests deben fijar la semántica elegida.

`success` describe aquí la finalización completa del ciclo HTTP, no el resultado de negocio ni la
clase del status HTTP. Una vez que un error de aplicación ha sido renderizado completamente por el
framework como `4xx` o `5xx`, el adaptador ya no dispone de una señal causal fiable para
distinguirlo de una respuesta intencionada con el mismo status. Clasificar por `statusCode`
mezclaría errores técnicos, validaciones y decisiones de negocio. Si un error impide completar la
respuesta, el lifecycle sí debe finalizar como `failure`.

### Streaming

Determinar cuándo deja de consumir concurrencia una respuesta con stream:

- al producir el objeto de respuesta; o
- al terminar de escribir el stream.

La opción recomendada es la segunda, porque representa la ocupación real del servidor y coincide
con el comportamiento actual basado en el ciclo de la respuesta. Debe probarse con streaming real
en Express, Fastify y las dos plataformas de NestJS.

## Fase 1: evaluar y, si procede, mejorar el host Node

### Problema

`run(task)` combina dos responsabilidades:

1. esperar hasta que el core permite empezar;
2. completar el trabajo y notificar su resultado.

Fastify separa el comienzo y el final de una petición mediante hooks. Mantener una promesa abierta
desde un hook de entrada puede impedir que el pipeline avance si Fastify espera esa misma promesa.
Es posible integrar `run()` mediante callbacks y estado auxiliar, pero el resultado sería más
frágil y específico del adaptador.

### Spike obligatorio

Construir primero una prueba mínima con un servidor Fastify real que intente integrar `run()` sin
cambiar el host. Comprobar:

- admisión inmediata;
- una segunda petición en cola;
- rechazo antes de ejecutar el handler;
- desconexión mientras espera;
- finalización de respuesta y shutdown.

Si el resultado necesita estado duplicado, callbacks que puedan invocarse dos veces o una promesa
deliberadamente no esperada, adoptar la API de permiso descrita a continuación. Si `run()` ofrece
una integración simple y demostrablemente correcta, documentar la decisión de no ampliar el host.

### Mejora recomendada: permiso de admisión

Añadir al host una API de adquisición, con nombres definitivos decididos durante la implementación:

```ts
const permit = await controller.acquire(priority, { signal });

try {
  await work();
  permit.complete('success');
} catch (error) {
  permit.complete('failure');
  throw error;
}
```

Contrato requerido:

- `acquire()` se resuelve solo al recibir la acción `start` del componente.
- Rechazo, queue full, eviction, cancelación y shutdown conservan las clases de error actuales.
- El permiso solo puede completarse una vez. Las llamadas posteriores deben ser idempotentes o
  producir un error de uso explícito; elegir una semántica y probarla.
- Cancelar el `AbortSignal` solo cancela mientras el trabajo sigue queued.
- El host nunca mantiene estado del componente bloqueado mientras se ejecuta código de usuario.
- `run()` se implementa sobre el mismo mecanismo para evitar dos máquinas de estados divergentes.
- La API existente y sus errores permanecen compatibles.

No se necesita cambiar WIT: `submit`, las acciones `start`, `complete`, `cancel` y los deadlines
existentes ya permiten implementar el permiso en el host.

### Pruebas del host

Añadir pruebas en `code/hosts/node/tests/` para:

- permiso inmediato;
- permiso después de permanecer queued;
- prioridad y FIFO sin regresiones;
- threshold rejection y queue full;
- eviction por deadline;
- abort antes de submit, durante queued y después de start;
- éxito y fallo comunicados una sola vez;
- doble finalización;
- shutdown antes y después de adquirir;
- limpieza de timer, abort listener y tareas pendientes;
- compatibilidad de `run()` construida sobre la nueva primitiva.

Ejecutar como gate:

```bash
make validate-node
```

## Fase 2: separar política compartida de transporte Express

### Objetivo

Convertir `code/adapters/shared` en código realmente reutilizable. No debe conocer Express,
Fastify ni NestJS.

### Elementos que sí pueden ser compartidos

- Tipos de configuración comunes del controlador.
- Normalización de prioridad y fallback a `Priority.default()`.
- Clasificación de errores de admisión.
- Política que transforma un error de admisión en datos neutrales:

```ts
interface AdmissionHttpErrorDescriptor {
  statusCode: number;
  headers: Record<string, string>;
  body: object;
}
```

- Utilidades sin acceso directo a request o response.

### Elementos que deben pertenecer a cada adaptador

- Lectura del request específico del framework.
- Eventos de abort, finish, close, timeout y error.
- Escritura de status, headers y body.
- Registro de middleware, plugin, hooks, filtros e interceptores.
- Lifecycle y cierre del servidor o módulo.

### Migración

1. Extraer primero la normalización de prioridad y el descriptor neutral de error.
2. Mover el handler Express a `code/adapters/express` sin cambiar su API pública.
3. Eliminar imports y dev dependencies de Express del paquete `shared`.
4. Adaptar NestJS a las piezas neutrales, no al nuevo handler de Express.
5. Mantener tests unitarios de política en `shared` y tests de lifecycle en cada adaptador.

### Siguiente iteración: corregir el lifecycle de Express

La migración del handler debe corregir, y no reproducir, la semántica actual de finalización de
`code/adapters/shared/src/middleware/pid-controller-middleware-handler.ts`. Actualmente el evento
`close` siempre resuelve la tarea como éxito y el `catch` delega cualquier error mediante
`next(error)`, incluso cuando el cliente ya se ha desconectado.

Reglas requeridas:

- `finish` completa el trabajo como `success`.
- `close` completa como `success` únicamente cuando `res.writableFinished` sea verdadero; un cierre
  prematuro completa como `failure`.
- Un evento `error` de la respuesta completa como `failure`.
- `finish`, `close` y `error` deben pasar por un único guard de terminalidad y retirar todos los
  listeners exactamente una vez.
- Un `CancelledRequestError` producido al abortar una petición todavía queued no se pasa a
  `next()`, porque ya no existe un cliente al que responder.
- Un cierre prematuro no se pasa a `next()` cuando `req.aborted` o `res.destroyed` confirmen la
  desconexión.
- Los rechazos de admisión con una conexión viva se pasan a `next(error)` para que la política HTTP
  de Express pueda escribir `429`, `503` o el status configurado.
- `res.headersSent` no se utiliza por sí solo para suprimir `next(error)`: Express requiere delegar
  los errores ocurridos después de enviar cabeceras para que su error handler final pueda cerrar la
  conexión. El adaptador no debe intentar escribir directamente una segunda respuesta.
- Una respuesta completada cuenta como `success` aunque su status sea `4xx` o `5xx`.
- La API pública de `pidControllerMiddleware` permanece sin cambios y Express continúa usando
  `AdaptiveAdmissionController.run()`; esta corrección no migra el adaptador a `acquire()`.

Pruebas requeridas en `code/adapters/express/tests/`:

- Pruebas unitarias con request, response y controlador controlados para `finish`, cierre prematuro,
  `close` posterior a `finish`, evento `error`, rechazo de admisión con conexión viva, cancelación
  queued sin `next()` y limpieza de listeners.
- Una caracterización explícita de que una respuesta `4xx` o `5xx` completamente renderizada
  finaliza como `success`.
- Una integración con servidor y socket reales que aborte una respuesta durante streaming y
  compruebe que no hay crash ni respuesta tardía, que el trabajo admitido termina como `failure` y
  que el servidor sigue procesando peticiones posteriores.
- Ejecutar los mismos escenarios en la matriz existente de Express 4 y Express 5.

Gate de regresión:

```bash
make validate-shared
make validate-express
```

## Fase 3: crear el adaptador Fastify

### Paquete

Crear:

```text
code/adapters/fastify/
```

Nombre npm propuesto:

```text
@jfrz38/pid-controller-fastify
```

El paquete debe ser ESM, requerir Node 24 o superior y declarar como peers al host Node y a
Fastify. `fastify-plugin` solo debe añadirse si se necesita conscientemente su comportamiento de
encapsulación; no incluirlo por costumbre.

### API pública propuesta

Preferir un plugin idiomático:

```ts
import Fastify from 'fastify';
import { pidControllerPlugin } from '@jfrz38/pid-controller-fastify';

const app = Fastify();
await app.register(pidControllerPlugin, {
  pid: {
    config: { maxConcurrentRequests: 10 },
    priority: {
      getPriority: (request) => request.headers['x-priority'],
    },
  },
});
```

Decidir y documentar si el plugin protege:

- todas las rutas dentro de su scope de encapsulación;
- todas las rutas de la instancia mediante `fastify-plugin`; o
- rutas seleccionadas mediante una opción o `routeOptions.config`.

La primera versión debe elegir un modelo claro; no combinar varios mecanismos de selección sin un
caso de uso demostrado.

### Hooks a evaluar

La implementación debe verificar el orden real de hooks de la versión soportada. Como punto de
partida:

- hook de entrada (`onRequest` o el más temprano que permita obtener la prioridad) para esperar la
  admisión;
- `onResponse` para completar tras enviar correctamente;
- `onError` para marcar fallo sin apropiarse de errores de aplicación;
- `onRequestAbort` para cancelar una petición queued;
- `onTimeout` para el timeout del servidor, si aplica a la versión soportada;
- `onClose` para ejecutar el shutdown idempotente.

No completar el permiso desde varios hooks sin un guard central de terminalidad exactamente una
vez.

### Manejo de errores

- Convertir únicamente errores derivados de `AdmissionRequestError` que tengan política HTTP.
- No convertir `ConfigurationError`, `ControllerProtocolError` ni errores de aplicación.
- No reemplazar silenciosamente un error handler configurado por el consumidor.
- Si se instala un error handler encapsulado, los errores desconocidos deben propagarse al handler
  padre de Fastify.
- No escribir después de que `reply.sent` sea verdadero o el socket esté cerrado.
- Mantener los defaults actuales: `429` para threshold y `503` para queue full, eviction y
  shutdown; `499` solo mientras la conexión continúe abierta.

### Lifecycle y observabilidad

- Crear un controlador por registro del plugin, salvo que se acepte explícitamente uno inyectado.
- Cerrar el controlador desde `onClose`.
- Exponer de forma documentada el controlador o sus diagnósticos solo si existe un caso de uso;
  evitar decoradores públicos accidentales.
- No convertir eventos diagnósticos en decisiones de admisión.

### Pruebas de Fastify

#### Unitarias

Reservarlas para política local sin framework real:

- extracción y fallback de prioridad;
- guard de finalización única;
- clasificación de errores;
- opciones y defaults propios del paquete.

#### Integración con Fastify real

Usar una instancia real y `inject()` cuando reproduzca el riesgo. Usar un socket HTTP real cuando
sea necesario observar abort, close, timeout o streaming, ya que `inject()` no garantiza esas
propiedades.

Escenarios mínimos:

1. Una petición admitida ejecuta el handler y conserva su respuesta.
2. La concurrencia máxima mantiene una segunda petición queued hasta liberar la primera.
3. La prioridad altera el orden de salida de varias peticiones queued.
4. Threshold rejection devuelve `429` y no ejecuta el handler.
5. Queue full y eviction devuelven `503`.
6. La personalización de status, mensaje, body y `Retry-After` se aplica.
7. Un error de aplicación llega al error handler del consumidor sin convertirse en error de
   admisión.
8. Un cliente desconectado mientras espera cancela y no intenta responder.
9. Una respuesta streaming conserva el permiso hasta finalizar el stream.
10. Cerrar Fastify ejecuta shutdown sin dejar handles abiertos.
11. Registrar más de una instancia encapsulada no mezcla estado.
12. Todos los listeners y decoradores quedan limpios al cerrar.

## Fase 4: hacer NestJS compatible con Express y Fastify

### Preflight de documentación y CI de Fastify

Antes de modificar NestJS, comprobar que la integración Fastify directa continúa representada de
forma fiel por su README y por los checks del repositorio:

- revisar `code/adapters/fastify/README.md` como portada pública de npm y contrastar sus ejemplos,
  peers, alcance, errores y lifecycle con la API y las pruebas reales del paquete;
- revisar las ejecuciones de GitHub Actions que validan Fastify y confirmar que build, lint y tests
  de integración se ejecutan, sin presentar como permanente un workflow temporal del roadmap;
- actualizar el README si los workflows, el contrato público, los rangos soportados o el wiring
  compartido con NestJS cambian durante la iteración;
- añadir el badge de CI solo cuando exista el workflow permanente `build-fastify.yml`, comprobando
  que el enlace y el badge funcionan tanto en GitHub como en la portada de npm.

### Spike de plataforma

Antes de elegir middleware o interceptor, levantar dos aplicaciones NestJS reales con el mismo
módulo:

```ts
NestFactory.create(AppModule); // Express
NestFactory.create(AppModule, new FastifyAdapter()); // Fastify
```

Registrar en tests qué objetos reciben realmente middleware, filtros e interceptores en cada
plataforma, incluidos sus objetos `raw`. No basar el diseño solo en tipos TypeScript.

Comparar dos alternativas:

1. Conservar middleware para el gate de admisión y añadir drivers internos de lifecycle por
   plataforma.
2. Usar un interceptor global que espere el permiso antes de suscribirse a `next.handle()`, pero
   completar el permiso con los eventos reales de la respuesta, no solo al completar el Observable.

Elegir la solución más pequeña que mantenga route selection, streaming, cancelación y finalización
exacta. No migrar a interceptor únicamente por neutralidad aparente.

### Escritura neutral de respuestas

Inyectar `HttpAdapterHost` en el filtro y utilizar el adaptador HTTP de Nest para:

- comprobar si headers o respuesta ya fueron enviados;
- fijar `Retry-After`;
- escribir status y body.

Eliminar las llamadas Express `set().status().json()` del camino NestJS.

### Lifecycle de request y response

Crear una interfaz interna mínima solo si el spike demuestra diferencias reales, por ejemplo:

```ts
interface NestHttpLifecycle {
  signalFor(request: unknown, response: unknown): AbortSignal;
  observeCompletion(response: unknown, listener: CompletionListener): () => void;
  isDisconnected(response: unknown): boolean;
}
```

Implementar drivers Express y Fastify dentro del paquete NestJS. Esta interfaz es interna y no debe
convertirse en API pública hasta que exista un consumidor externo real.

### Tipos y dependencias

- Eliminar imports de tipos Express de código Nest neutral.
- Evitar obligar a una aplicación Fastify a instalar Express.
- Evaluar si `@nestjs/platform-express` y `@nestjs/platform-fastify` deben ser peers opcionales o
  solo dev dependencies para la matriz de tests. Normalmente la aplicación Nest ya proporciona una
  de las plataformas.
- Tipar `getPriority` de forma útil sin prometer un request idéntico entre plataformas. Se puede
  ofrecer un genérico o un tipo neutral, conservando compatibilidad cuando sea viable.
- Documentar diferencias de acceso a headers y objetos raw en los ejemplos.

### Route selection

Conservar y probar `allowedRoutes` y `excludeRoutes` en ambas plataformas:

- método concreto y `RequestMethod.ALL`;
- ruta exacta, parámetros y wildcard soportado por Nest;
- prefijo global;
- rutas excluidas;
- orden de registro del módulo.

No duplicar el router de Nest dentro del adaptador.

### Pruebas NestJS

La fuente de verdad será una suite E2E parametrizada que ejecute los mismos escenarios con
`@nestjs/platform-express` y `@nestjs/platform-fastify`:

- admisión y respuesta normal;
- cola y orden por prioridad;
- route selection y exclusiones;
- rechazo y headers HTTP;
- error de aplicación no convertido;
- desconexión queued;
- streaming;
- shutdown mediante `app.close()` y shutdown hooks;
- ningún handle abierto después del cierre.

Los tests unitarios actuales que solo comprueban delegación a un mock pueden mantenerse si protegen
una decisión útil, pero no sustituyen la suite E2E: no detectan incompatibilidades entre plataformas.

Gate:

```bash
make validate-nestjs
```

## Fase 5: workspace, CI y publicación

### Workspace y comandos

El glob `adapters/*` ya incluirá el paquete Fastify. Actualizar además:

- `code/pnpm-lock.yaml`;
- mapas `PACKAGE_NAME_*` y `PACKAGE_DIR_*` del `Makefile`;
- `build-fastify`, `test-fastify` y `validate-fastify`;
- `pack-local PACKAGE=fastify`;
- ayuda del `Makefile` generada por las descripciones de targets.

### CI

- Añadir `.github/workflows/build-fastify.yml` siguiendo los workflows existentes.
- Ejecutar build, lint y tests de integración del paquete.
- Ejecutar la matriz Nest Express/Fastify en `build-nestjs.yml`.
- Mantener Node 24 y pnpm fijado como en el resto del repositorio.
- No marcar verde un job que solo haya ejecutado tests con mocks del framework.

### Smoke tests de consumidor

Ampliar `code/scripts/consumer-package-smoke.mjs` para empaquetar e instalar tarballs reales de:

- host Node;
- Express;
- Fastify;
- NestJS.

El smoke debe arrancar y consultar:

1. una aplicación Express;
2. una aplicación Fastify directa;
3. NestJS con `@nestjs/platform-express`;
4. NestJS con `@nestjs/platform-fastify`.

El smoke comprueba empaquetado, exports, peer dependencies y wiring esencial; no debe duplicar toda
la suite funcional.

### Release

Añadir Fastify a:

- matriz de `.github/workflows/release.yml`;
- selector y resolución de `.github/workflows/publish.yml`;
- selector de `.github/workflows/bump-version.yml`.

Convención propuesta:

```text
fastify-vX.Y.Z
```

Actualizar la documentación de paquetes y releases del README raíz. npm seguirá siendo la fuente
de verdad de la versión `latest` de cada paquete.

## Fase 6: documentación

### README de Fastify

Debe incluir:

- instalación y peers;
- registro del plugin y alcance de encapsulación;
- configuración del controlador y prioridad;
- personalización de errores;
- lifecycle y shutdown automático;
- selección o exclusión de rutas, si se implementa;
- comportamiento con abort, timeout y streaming;
- tabla de errores y status por defecto;
- limitación por proceso o worker;
- ejemplo ejecutable mínimo.

### README de NestJS

Actualizarlo para:

- declarar soporte explícito de Express y Fastify;
- eliminar la afirmación de que Express es siempre requerido;
- añadir ambos bootstraps;
- mostrar cómo tipar o leer la prioridad en cada plataforma;
- documentar cualquier diferencia inevitable de lifecycle;
- indicar la matriz de versiones probada.

### README raíz

- Añadir Fastify a la lista de adaptadores.
- Añadir `make validate-fastify` y `PACKAGE=fastify`.
- Explicar que NestJS soporta sus dos plataformas HTTP verificadas.

## Orden recomendado de pull requests

1. **Caracterización:** tests de regresión de Express y E2E mínimos de Nest Express; spike Fastify.
2. **Host:** API de permiso, solo si el spike confirma su necesidad, manteniendo `run()` compatible.
3. **Shared/Express:** separar política neutral y mover lifecycle Express a su paquete.
4. **Fastify:** paquete, plugin, tests, documentación y targets locales.
5. **NestJS:** soporte dual y suite E2E parametrizada.
6. **Distribución:** smoke de tarballs, CI, release, publish y bump-version.
7. **Documentación final:** README raíz y matriz de compatibilidad.

Separar estos cambios permite revisar la semántica del host antes de mezclarla con APIs de
framework y mantiene cada regresión localizada.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Deadlock al esperar una promesa en un hook Fastify | Spike real y API de permiso si `run()` no encaja |
| Completar dos veces desde hooks distintos | Guard terminal único y tests de carreras de eventos |
| Considerar éxito un socket cerrado prematuramente | Matriz explícita de eventos y sockets reales en tests |
| Romper Express al neutralizar `shared` | Caracterización previa y API pública sin cambios |
| Nest parece neutral en unit tests pero falla con Fastify | E2E parametrizado con las dos plataformas reales |
| Error handler Fastify pisa el del usuario | Encapsulación y propagación de errores desconocidos |
| Listener o timer filtrado | Tests de shutdown y handles abiertos |
| Peer ranges prometen versiones no verificadas | Matriz CI igual al rango publicado |
| Streaming libera concurrencia demasiado pronto | Completar en el evento real de finalización |
| Diferencias entre inyección Fastify y red real | Sockets reales para abort, close, timeout y streaming |

## Criterios de aceptación globales

- `@jfrz38/pid-controller-fastify` protege peticiones reales sin bloquear el event loop.
- Fastify conserva respuestas y errores de aplicación ajenos al controlador.
- Todos los resultados de admisión y lifecycle se notifican exactamente una vez.
- Express conserva su comportamiento y API pública documentada.
- El mismo módulo NestJS funciona en aplicaciones reales Express y Fastify.
- Una aplicación Nest Fastify no necesita Express por un detalle interno del adaptador.
- Rechazo, cola, eviction, cancelación, streaming y shutdown están cubiertos en la frontera donde
  su riesgo es observable.
- Los tarballs instalados en un consumidor limpio arrancan y procesan una petición en las cuatro
  combinaciones soportadas.
- `make ci`, `make validate-fastify`, `make validate-express`, `make validate-nestjs` y
  `make validate-node` finalizan correctamente.
- README, peers, matriz CI y workflows de release describen la misma compatibilidad.

## Fuera de alcance

- JVM, Spring Boot, Ktor, Akka o cualquier host no Node.
- Coordinación distribuida entre procesos, workers, contenedores o hosts.
- Cambios al algoritmo PID o a las decisiones del core Rust.
- Cambios WIT que solo intenten acomodar APIs HTTP.
- Adaptadores Koa, Hapi, Next.js, Hono u otros frameworks sin una petición independiente.
- Una abstracción HTTP universal que oculte diferencias relevantes de lifecycle.
