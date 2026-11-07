---
source: docs/klarbefund/user-guide.md
sourceHash: 3278a2f8f333e765cf1f68b22430ff3027cb9b6dc36789f2ecf94d4457a48188
language: es
summary: "La app tal como la usa una persona, pantalla a pantalla con capturas: incorporar un informe, comprobar un valor con el papel, tendencias, consentimientos, conectar con el EEDS, exportaciones y sus derechos sobre sus datos."
---

# Guía del usuario de Klarbefund

Klarbefund convierte un informe de laboratorio en papel en valores que usted puede leer, cotejar con
el papel y seguir a lo largo del tiempo. Todo se ejecuta en el teléfono: el escaneo, la
lectura, la codificación, el almacenamiento y las exportaciones. No hace falta ninguna cuenta, y
nada sale del dispositivo a menos que usted lo envíe.

Esta guía recorre la aplicación tal como la usa una persona, tarea por tarea. La
parte de desarrollo (compilación, pruebas, el diccionario compartido, la organización del almacenamiento) está en la
[guía para desarrolladores](developer-guide.md). El trabajo se sigue en la
[incidencia #186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186).

Cada captura de pantalla de esta guía muestra datos inventados. El laboratorio, la
consulta, el paciente y cada número proceden del conjunto de datos de desarrollo ficticio
de la propia aplicación, de modo que una captura de pantalla puede publicarse sin que un informe real
haya intervenido nunca. Cómo se hacen se explica al
[final de esta guía](#how-these-screenshots-are-made).

| Nombre de la aplicación | Klarbefund, en inglés y en alemán                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Funciona en             | iPhone, iOS 26 o posterior                                                                                     |
| Cómo obtenerla          | [Beta pública de TestFlight](https://testflight.apple.com/join/ssADSXX6), 200 plazas                           |
| Idiomas                 | Inglés y alemán, según el idioma del teléfono                                                                  |
| Código fuente           | [`clients/ios/`](../../clients/ios/)                                                                           |
| Privacidad              | [Política de privacidad](https://ma3u.github.io/MinimumViableHealthDataspacev2/meinbefund/privacy.html)        |
| No es                   | un producto sanitario: explica qué es una medición y nunca juzga un valor ([más abajo](#not-a-medical-device)) |

## Primeros pasos

1. En el iPhone, abra el [enlace de TestFlight](https://testflight.apple.com/join/ssADSXX6).
   [TestFlight](https://developer.apple.com/testflight/) se instala primero si falta y después ofrece Klarbefund.
2. Abra Klarbefund. No hay registro ni cuenta: la aplicación está lista para
   el primer escaneo.
3. La primera vez que escanee, iOS le pedirá acceso a la cámara. La aplicación solo la usa para
   las páginas de un informe y para el código QR que la conecta con su historial;
   las fotografías se quedan en el teléfono.

**El bloqueo.** De forma predeterminada, la aplicación pide [Face ID](https://developer.apple.com/documentation/localauthentication), Touch ID o el código
cada vez que pasa a primer plano, para que sus resultados no queden a la vista de
quien tenga el teléfono desbloqueado. El interruptor está en **Proveedor de análisis**,
en el menú **⋯**, sección **Protección**. Un teléfono sin código no tiene
nada que pedir, y el bloqueo se abre entonces por sí solo ([ADR-060](../ADRs/ADR-060-the-app-locks-with-face-id-and-answers-pinning-and-jailbreak-detection.md)).

## Sus informes

<img src="img/list.png" width="300" alt="La lista de informes, una fila por informe con el laboratorio, la fecha, el número de valores y una insignia de procedencia">

La pantalla de inicio enumera todos los informes, el más reciente primero: el título, el laboratorio,
la consulta o el dispositivo del que procede, la fecha de la toma de muestra y cuántos valores
se leyeron. **1 por revisar** señala un informe con un valor que todavía no ha
cotejado con el papel.

La insignia de color es la **procedencia** del informe, y importa más de lo que
parece. **Emitido por el laboratorio, definitivo** significa que los valores salieron de un PDF que contenía
el texto propio del laboratorio, de modo que no se adivinó nada. **Escaneado, preliminar**
significa que los valores se leyeron de una fotografía, de una hoja de papel o de la
pantalla de un dispositivo, y una fotografía puede leerse mal. Un valor sigue siendo preliminar
hasta que usted lo haya cotejado con el original.

En la parte superior de la lista está lo necesario para consultar sus informes: **Tendencias**,
**Mi historial del EEDS** con el estado de su conexión y **Posibles
duplicados** cuando dos informes parecen el mismo. El botón **+** inicia
un escaneo, una importación o **Mediciones anteriores** introducidas a mano. El botón **⋯**
contiene los ajustes y sus derechos sobre sus datos, en tres grupos: _Sobre
usted_ (perfil, valores de referencia), _Privacidad y uso compartido_ (consentimientos, proveedor de análisis, privacidad y seguridad) y _Sus datos_ (exportar, eliminar y, en
_Investigación y soporte_, la exportación OMOP y los diagnósticos).

## Añadir un informe

Hay tres formas, y es el documento el que decide cuánto valen sus valores.

- **Escanear informe** abre la cámara para un informe en papel. La aplicación detecta los bordes
  de la página, lee la tabla en el dispositivo y conserva las páginas como PDF junto a
  los valores. Los informes de varias páginas no son un problema.
- **Importar un PDF o una foto** toma un archivo que le haya dado su laboratorio o su portal. Si
  el PDF contiene la capa de texto propia del laboratorio, los valores se marcan como
  definitivos; un PDF que solo es una imagen pasa por el reconocimiento de texto como un escaneo.
- **Importar desde Fotos** toma fotografías que ya están en el teléfono, hasta doce
  a la vez.

La aplicación lee más que hojas de laboratorio. Una **monitorización ambulatoria de la presión
arterial de 24 horas**, un **ECG en reposo o de esfuerzo**, un **informe de Holter**, una
**espirometría**, una **prueba de lactato**, un **perfil de glucosa CGM**, una **densitometría DXA**
y un **análisis del microbioma intestinal** tienen cada uno su propio lector, de modo que los valores que una
consulta imprime en esas hojas llegan con los códigos y las unidades correctos.

Una **báscula de composición corporal** fotografiada en un gimnasio se reconoce como lo que
es: un panel, no un informe. La aplicación lee el indicador, su valor actual y
la fecha que muestra la báscula, y cuando la báscula representa un historial, mide los
puntos del gráfico y marca esos valores como estimaciones. Los propios
veredictos de la báscula («Normal», «Bajo») se ignoran; son los rangos del fabricante, no
los de una guía clínica.

Antes de guardar nada, la aplicación muestra lo que ha leído y le pide que confirme
la fecha de laboratorio que encontró en la hoja. Se le indica si un informe se parece a uno que
ya tiene; **Posibles duplicados**, en la parte superior de la lista,
aparece siempre que dos informes guardados parecen el mismo.

## Revisar un informe, valor por valor

<img src="img/detail.png" width="300" alt="Un informe: el laboratorio, las fechas y el número de informe leídos de la hoja, y después cada valor con su código LOINC, el rango impreso, la página y la línea, y el rango publicado">

La parte superior de un informe es lo que la aplicación leyó del encabezado de la hoja: el
laboratorio, la fecha de la toma de muestra, la fecha de emisión del informe, el
número de informe y un enlace a las páginas originales.

Después viene cada medición y, debajo de cada una, los cuatro elementos que la hacen
verificable:

- **el código LOINC** al que se asignó, para que el valor signifique lo mismo en
  todos los sistemas a los que se exporte. La unidad elige el código, nunca el nombre:
  la lipoproteína(a) en mg/dL y en nmol/L son mediciones distintas con
  códigos distintos. Una magnitud que LOINC no codifica lo dice claramente en lugar de
  mostrar un código aproximado, y un organismo de un análisis de heces muestra en su lugar su
  identificador de [NCBI Taxonomy](https://www.ncbi.nlm.nih.gov/taxonomy), porque LOINC nombra pruebas y no organismos;
- **el rango de referencia que imprimió su laboratorio**, exactamente como está impreso, nunca
  normalizado;
- **la página y la línea** de las que se leyó, para que cualquier número pueda cotejarse
  con el papel que tiene delante;
- **el rango publicado**, cuando una guía clínica o un estudio citado indica uno ([ADR-039](../ADRs/ADR-039-published-reference-ranges.md)), con
  palabras y un símbolo junto al color: «en el rango óptimo», «fuera del
  rango óptimo», «fuera del rango de la guía». Se trata de una comparación con un
  número que alguien ha publicado. No es un hallazgo clínico.

**Cotejar con el papel.** Toque un valor para corregir su nombre, su número o su
unidad; la corrección se guarda junto a lo que leyó el reconocimiento de texto, de modo que el rastro en papel
se conserva. **Marcar todos los valores como revisados** pasa los valores del informe de
preliminares a revisados una vez que los haya comparado. Un informe con valores
aún por revisar muestra **por revisar** en la lista.

Debajo de los valores reconocidos aparecen dos listas que la aplicación nunca oculta: las líneas que
parecían mediciones pero no coincidían con nada del diccionario, y las líneas
que no pudieron leerse en absoluto. Una fila que desapareciera en silencio sería
indistinguible de una fila que nunca se imprimió, así que ninguna fila desaparece.
**Notificar valores que faltan**, en el menú del informe, envía a los desarrolladores las
etiquetas de esas filas, nunca los valores, para que el diccionario pueda crecer.

El botón de compartir ofrece las exportaciones descritas más abajo. El menú le permite
volver a leer el informe con la versión actual del lector, volver a escanear el papel,
editar su nombre y su laboratorio, exportar sus diagnósticos o eliminarlo.

## Las páginas originales

<img src="img/scan.png" width="300" alt="Las páginas guardadas de un informe, mostradas tal como se escanearon">

Cada informe conserva sus páginas, como un único PDF, cifrado igual que los valores. **Escaneo
original** las vuelve a mostrar, de modo que la fuente está siempre a un toque de la lectura.

## Tendencias

<img src="img/trends.png" width="300" alt="La pantalla de tendencias: un gráfico por medición, ordenado según lo lejos que está el último valor de su rango">

**Tendencias** dibuja un gráfico por medición a lo largo de todos los informes, ordenado según
lo que más se aleja de su rango. Los filtros lo limitan a lo que importa: solo
los analitos medidos más de una vez, o solo los que están fuera de un rango.

Cada gráfico indica lo que muestra. Cada tipo de evidencia tiene su propia forma:
un círculo procede del archivo propio de un laboratorio, un rombo se leyó de una
fotografía y es preliminar, y un triángulo lo introdujo usted o procede
de un dispositivo. Una leyenda debajo de cada gráfico que los mezcla nombra cada forma con
palabras, de modo que nada depende del color ni de tocar un punto. La banda verde es
el rango óptimo publicado cuando existe; para todo lo demás, la banda
dibujada es el rango que imprimió su propio laboratorio, en su propio color y designado como
tal. Debajo del gráfico se enumera cada punto con su fecha, su procedencia
y el informe al que pertenece, y al tocar un punto se abre ese informe.

Una frase debajo de cada gráfico indica **qué es la medición**: una definición de
la prueba, en inglés o en alemán. Nunca es una interpretación de su propio valor.

Al final, **Mostrar tendencias de [Apple Health](https://developer.apple.com/documentation/healthkit)** lee su frecuencia cardíaca
en reposo, la variabilidad de la frecuencia cardíaca, los pasos y el peso, tras pedir permiso
una sola vez. Aparecen en su propia sección, **De sus dispositivos**, como líneas grises
discontinuas de medias semanales sobre los mismos meses que sus informes, con una fina
línea azul el día de cada informe para poder leer unas frente a otros.
Nunca se dibujan como un valor de laboratorio: sin rango, sin comparación, sin un color que
signifique algo, y no entran en ninguna exportación. La aplicación los lee mientras la
pantalla está abierta, no escribe nada en Salud y no guarda ninguna copia.

## Valores de referencia

<img src="img/reference.png" width="300" alt="Valores de referencia: una tarjeta por medición con el umbral de la guía y el rango óptimo por unidad, cada uno con su fuente">

**Valores de referencia** es la tabla que hay detrás de los rangos. Una tarjeta por medición,
una línea por unidad, dos columnas: **Guía**, el umbral que un organismo emisor de guías
establece para adultos, y **Óptimo**, el rango de menor riesgo que indica la misma
fuente. Cada tarjeta nombra su fuente y enlaza a ella; cuando una fuente
distingue por nivel de riesgo o por edad, la tarjeta lo indica y deja la elección del
nivel a un profesional clínico.

Una medición sin una fuente citable simplemente no aparece. Esa es la diferencia
con las tablas de longevidad en las que se inspiró esta pantalla, que citan números
que nadie puede verificar. El menú de categorías limita la lista a un panel, e indicar
su sexo en el perfil añade los rangos que difieren según el sexo.

## Perfil y mediciones anteriores

<img src="img/profile.png" width="300" alt="El perfil: sexo, fecha de nacimiento y estatura, y después perímetro de cintura, peso y grasa visceral con la fecha de cada medición"> <img src="img/history.png" width="300" alt="Mediciones anteriores: una fecha por línea con el perímetro de cintura y el peso medidos ese día">

El **perfil** contiene el sexo, la fecha de nacimiento y la estatura, que solo se usan para elegir los
rangos publicados que se le aplican, y las medidas corporales: perímetro de cintura, peso
y grasa visceral. Cada medición conserva su propia fecha e indica de dónde
procede. Un valor leído de la fotografía de una báscula se etiqueta como tal; uno que usted escribe
se etiqueta como introducido por usted.

**Mediciones anteriores**, en el menú **+**, sirve para ponerse al día: una fecha por línea, con lo que
haya medido ese día. Al guardar, cada fecha se almacena como un informe propio, marcado como
introducido por usted, y se calculan el IMC y el índice cintura-estatura a partir de la
estatura del perfil. Se incorporan a las tendencias y a las exportaciones por el mismo
camino que los valores de un laboratorio.

## Preguntar qué es un valor

<img src="img/consent.png" width="300" alt="Enviar para análisis: los valores que se enviarán, cada uno con su código, una indicación de que se quedan en este iPhone, y la pregunta"> <img src="img/settings.png" width="300" alt="Proveedor de análisis: el bloqueo con Face ID, y después en este iPhone, el servicio de Klarbefund, su propio Azure OpenAI o su propia clave de Anthropic">

Puede pedir a la aplicación que explique un conjunto de valores. De forma predeterminada responde el modelo del
iPhone, de modo que la pregunta no llega a ninguna red.

Si prefiere usar un servicio, elige los valores, los ve enumerados con
sus códigos y confirma antes de que se envíe nada. Solo viajan esos valores y su
pregunta. Su nombre, su fecha de nacimiento y su número de seguro nunca se
envían, porque la aplicación no los guarda; pueden figurar en la página
escaneada, que se queda en el teléfono. El proveedor que se esté usando se nombra en la
pantalla antes de enviar.

**Proveedor de análisis**, en el menú, determina de dónde procede una respuesta: de este
iPhone, del servicio de Klarbefund en la UE (por defecto, [Azure OpenAI en la zona de datos de la UE](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types#data-zone-standard)), o de su propio recurso de Azure OpenAI o su
clave de Anthropic. Con su propio servicio, el teléfono se comunica directamente con él, y
ni la clave ni los valores llegan al proveedor de esta aplicación ([ADR-034](../ADRs/ADR-034-claude-workload-identity-federation.md), [ADR-035](../ADRs/ADR-035-inference-provider-residency-and-quota.md)). La misma
pantalla contiene el interruptor **Protección** para el bloqueo con Face ID.

## Consentimientos

<img src="img/consents.png" width="300" alt="Consentimientos: participación en un estudio, la oposición a la ePA y el uso para registros, cada uno con su propio estado, titular, fecha y botón">

**Consentimientos**, en el menú, lleva su propio registro de tres decisiones que son
fáciles de confundir y nunca deben ser un solo interruptor:

- **Participación en un estudio**, su consentimiento para un estudio, que conserva el centro del estudio;
- **Historia clínica electrónica (ePA)**, una [_oposición_](https://www.gesetze-im-internet.de/sgb_5/__342.html), porque la ePA existe
  a menos que usted se oponga ante su seguro de enfermedad;
- **Uso para registros e investigación**, su consentimiento para que un registro o una base de datos
  de investigación utilice sus valores.

Cada uno tiene su propio estado, fecha, responsable y botón, y cambiar uno nunca
cambia otro. Al retirar uno, la concesión anterior se mantiene en el historial, de modo que usted
puede seguir mostrando cuándo la otorgó. La aplicación no informa a nadie: para otorgar o retirar uno,
póngase en contacto con quien lo conserve. Dos lugares utilizan este registro. **Exportar para investigación**
pregunta una vez antes de exportar cuando no hay registrado ningún consentimiento para registros, y **Compartir
para mi médico** le recuerda, si registró una oposición a la ePA, que
no hay ninguna ePA a la que subir datos mientras se mantenga.

## Conectar con el EEDS

<img src="img/connect.png" width="300" alt="Conectar con el EEDS: crear una cuenta, iniciar sesión con una cuenta o conectar mediante código QR desde la pantalla del paciente">

**Mi historial del EEDS**, en la parte superior de la lista, indica si la aplicación está conectada
y enviando datos, y abre **Conectar con el EEDS**, que conecta la aplicación con su historial en el
hub de demostración del [Espacio Europeo de Datos de Salud](https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng), para que pueda leerlo y, si usted así lo decide,
añadirle datos. Hay tres formas de entrar, y en el teléfono no se escribe ninguna contraseña en una página web:

- **Crear una cuenta del EEDS** crea una cuenta con su propio historial, vacío, en
  el hub de demostración y conecta el teléfono a ella. Recibe un nombre de usuario y una contraseña
  para iniciar sesión también en el sitio web. [Apple confirma](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) al hub que la solicitud
  procede de la aplicación auténtica en un dispositivo real, y por eso un simulador
  no puede hacerlo ([ADR-054](../ADRs/ADR-054-klarbefund-creates-a-sandbox-account-with-app-attest.md)).
- **Iniciar sesión con una cuenta del EEDS** que ya tenga.
- **Conectar mediante código QR** ([OAuth device grant](https://www.rfc-editor.org/rfc/rfc8628), [ADR-049](../ADRs/ADR-049-klarbefund-connects-by-device-grant.md)), desde la pantalla del paciente en un ordenador:
  1. En el ordenador, abra la pantalla del paciente (la aplicación muestra la dirección, para
     copiarla, compartirla o abrirla) e inicie sesión como paciente. Elija **Mostrar código QR**.
  2. En la aplicación, **Escanear código QR**. En el ordenador, **Apruebe en este
     ordenador** abre la página de consentimiento de [Keycloak](https://www.keycloak.org/docs/latest/server_admin/#device-authorization-grant); compruebe que el código que aparece allí
     es el que muestra la aplicación, y apruebe.
  3. La aplicación indica a qué cuenta se ha conectado y pregunta **¿Es esta su
     cuenta?** Un código que le hubiera mostrado otra persona conectaría el teléfono a
     la cuenta de esa persona; así que, si el nombre no es el suyo, elija **No soy yo,
     desconectar**.

Una vez conectada, **Mostrar mi historial del EEDS** enumera lo que el hub guarda sobre usted:
mediciones con sus rangos impresos y sus fechas, informes, vacunaciones y
el plan de medicación ([ADR-059](../ADRs/ADR-059-the-record-holds-reports-vaccinations-and-the-medication-plan.md)). En el hub de demostración todos los historiales son sintéticos, y la
pantalla lo indica. El historial se lee cuando usted lo abre, no se guarda en ninguna parte y nunca
se mezcla con sus informes escaneados.

Dos interruptores deciden lo que va en sentido contrario, y ambos están desactivados hasta que usted
los active:

- **Enviar mis informes a mi historial del EEDS**: mientras está activado, cada informe que
  escanee o vuelva a leer va a su propio historial, como valores preliminares marcados como
  leídos de un escaneo. Los valores sin código LOINC se quedan en el teléfono.
- **Enviar las tendencias de mis dispositivos a mi historial del EEDS**: las medias semanales de Apple
  Health que muestra la pantalla Tendencias, nunca un solo día ni una sola
  lectura; cada sincronización sustituye a la anterior ([ADR-057](../ADRs/ADR-057-klarbefund-sends-weekly-device-means.md)).

Desactivar cualquiera de los dos detiene los envíos posteriores; lo que se envió permanece en el historial
hasta que elimine la cuenta. **Desconectar** está en la aplicación y en la pantalla del paciente,
donde se enumeran todos los teléfonos conectados. En un teléfono que muestre la propia pantalla
del paciente, **Abrir en Klarbefund** hace lo mismo que el código QR, y la aplicación de
cámara del iPhone también abre Klarbefund a partir del código. El código funciona una sola vez,
durante dos minutos.

### Su EUDI Wallet, si desea una

Una EUDI Wallet es opcional. Klarbefund y el hub funcionan solo con un nombre de usuario y una
contraseña. Una wallet añade una segunda forma de iniciar sesión en el sitio web: d-you,
la EUDI Wallet alemana, o cualquier otra wallet certificada, acredita quién es usted con
su [PID](https://eu-digital-identity-wallet.github.io/eudi-doc-architecture-and-reference-framework/latest/) (su documento de identidad digital) en lugar de una contraseña.
d-you se [lanzará al público a principios de enero de 2027](https://www.bundesregierung.de/breg-de/aktuelles/digital-wallet-2452384). Hasta entonces,
el hub está registrado como parte usuaria en el entorno de pruebas (sandbox) de
SPRIND; por eso los pasos siguientes funcionan con la aplicación wallet de prueba de
d-you de ese entorno, todavía no con el d-you público ([ADR-065](../ADRs/ADR-065-the-eudi-wallet-sign-in-identifies-the-person.md), [ADR-066](../ADRs/ADR-066-the-hub-runs-its-own-eudi-verifier-behind-a-wallet-only-gate.md)).

El hub nunca guarda su nombre ni su fecha de nacimiento. Guarda en la cuenta un único hash
seguro de ellos, que solo dice «este PID pertenece a esta cuenta»
([ADR-067](https://github.com/ma3u/MinimumViableHealthDataspacev2/blob/main/docs/ADRs/ADR-067-a-pid-links-to-an-account-by-a-keyed-fingerprint.md)).
Un PID pertenece a una sola cuenta, así que decida por dónde empieza.

**Tiene primero Klarbefund y añade la wallet más tarde**

1. En la aplicación, **Conectar con el EEDS › Crear una cuenta del EEDS** le proporciona un
   nombre de usuario `kb-…` y una contraseña. **Mostrar contraseña** o **Copiar contraseña**
   la vuelve a mostrar.
2. En un ordenador, abra el sitio web y elija **Iniciar sesión con Keycloak**, con
   ese nombre de usuario y esa contraseña. No **Iniciar sesión con d-you**: la wallet solo puede
   abrir una cuenta a la que ya esté conectada, y esta todavía no lo está.
3. Abra **Perfil de salud › Conectar su cartera EUDI**, elija **Conectar su
   cartera EUDI** y escanee el código QR con d-you.
4. d-you nombra el servicio y solicita tres datos: nombres de pila, apellidos
   y fecha de nacimiento. Apruébelos con su código de Digital ID.
5. La página indica **d-you está conectado**. A partir de ahora, **Iniciar sesión con d-you**
   abre esta cuenta, y la aplicación sigue conectada como antes.

**Tiene primero la wallet y añade Klarbefund más tarde**

1. En el sitio web, elija **Iniciar sesión con d-you (QR)** y escanee el código.
   Apruebe los mismos tres datos.
2. Todavía no hay ninguna cuenta asociada a su PID, así que la página ofrece **Crear una cuenta
   con este PID**. Elíjalo solo si no tiene una cuenta de Klarbefund: si
   tiene una, conecte la wallet a ella como se indica arriba, porque su PID
   no puede pertenecer a dos cuentas.
3. La página muestra un nombre de usuario `kb-…` y una contraseña, una sola vez. Guarde ambos y, después,
   **Ya los he guardado, iniciar sesión**.
4. En la aplicación, **Conectar con el EEDS › Iniciar sesión con una cuenta del EEDS** con ese
   nombre de usuario y esa contraseña. La aplicación y la wallet abren ahora el mismo historial.

**Desconectar cartera**, en la misma página, elimina el hash; la cuenta, su
historial y la conexión de la aplicación se mantienen. Al eliminar la cuenta se elimina también el hash
con ella.

## Exportaciones y sus derechos sobre sus datos

Todo lo que contiene la aplicación puede salir de ella, en la forma que necesite el destinatario, y
solo cuando usted lo decida.

| Acción                             | Para                                                                                                                                                                 | Lo que obtiene                                                                                                                                                                                                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compartir para mi médico           | una consulta, la ePA                                                                                                                                                 | un resumen en PDF con las páginas originales anexadas, más un bundle [FHIR R4](https://hl7.org/fhir/R4/bundle.html)                                                                                                                                                             |
| Exportar para investigación (OMOP) | un equipo de análisis                                                                                                                                                | OMOP CDM v5.4 [`measurement.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#measurement), [`person.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#person), [`observation_period.csv`](https://ohdsi.github.io/CommonDataModel/cdm54.html#observation_period) |
| Exportar todos mis datos           | usted, conforme a los [arts. 15](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_15) y [20](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_20) del RGPD | cada informe, página, valor, campo del perfil y consentimiento, en un solo archivo                                                                                                                                                                                              |
| Eliminar todos mis datos           | usted, [art. 17 del RGPD](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng#art_17)                                                                                  | el almacenamiento se borra definitivamente; la cuenta que la aplicación creó en el hub, con su historial, sus valores y sus consentimientos, también se elimina; la aplicación lo advierte antes de hacerlo                                                                     |
| Exportar diagnósticos              | los desarrolladores                                                                                                                                                  | el texto reconocido y las dos pasadas del reconocimiento de texto, para corregir una línea mal leída                                                                                                                                                                            |

El bundle FHIR incluye cada valor con su código LOINC, su unidad [UCUM](https://ucum.org/ucum), el
rango que imprimió el laboratorio (como números cuando pueden leerse, y siempre como
el texto impreso en [`referenceRange.text`](https://hl7.org/fhir/R4/observation-definitions.html#Observation.referenceRange.text)), y la página y la línea de las que se leyó.
Un valor leído de una fotografía también se marca como preliminar en el bundle.
La exportación para el médico cabe en el [límite de 25 MB](https://www.kbv.de/praxis/tools-und-services/praxisnachrichten/2025/10-09/alles-nur-eine-frage-muessen-befundberichte-arztbriefe-etc-sofort-eingestellt-werden) de la ePA con las páginas adjuntas.

Todo pasa por la hoja de compartir del sistema: a la aplicación de la ePA, Archivos,
AirDrop o el correo. Deliberadamente no hay una subida propia, porque no existe
ninguna API hacia la ePA para una aplicación como esta, y es el ciudadano quien constituye el punto
de integración.

## Privacidad y seguridad

<img src="img/privacy.png" width="300" alt="Privacidad y seguridad: los informes se quedan en este teléfono, no se envía nada a menos que usted lo envíe, de dónde procede una explicación">

Las fotografías nunca salen del dispositivo. Los valores, las páginas y los diagnósticos se
cifran individualmente con [una clave que no está disponible mientras el teléfono está
bloqueado](https://developer.apple.com/documentation/security/ksecattraccessiblewhenunlockedthisdeviceonly) y que nunca se restaura en otro dispositivo. El almacenamiento está excluido de la
[copia de seguridad de iCloud](https://developer.apple.com/documentation/foundation/urlresourcevalues/isexcludedfrombackup). Cuando la aplicación no está en primer plano, su contenido se oculta, de modo que el
selector de aplicaciones no muestra nada, y al volver se pide Face ID o el código.

Esto se comprobó, no se dio por supuesto: con el teléfono conectado por cable, copiar un historial
guardado, una exportación que quedó en la carpeta temporal o la instantánea que el propio sistema toma
de la aplicación falla siempre con un error de permisos, que es el aspecto que tiene desde fuera una [protección
completa de archivos](https://developer.apple.com/documentation/foundation/nsfileprotectioncomplete). La evaluación completa, objetivo por
objetivo, es la [autoevaluación](self-assessment.md); qué se probó y
cómo se recoge en las [evidencias](evidence.md).

## No es un producto sanitario

Klarbefund explica qué es una medición. No diagnostica, no
evalúa su riesgo y no recomienda tratamientos. Ninguna pantalla dice normal o
anormal, puntúa nada ni aconseja. Un valor leído de una fotografía puede estar
mal leído y se marca como preliminar hasta que usted lo coteje con el papel.
Los rangos de referencia se muestran exactamente como los imprimió su laboratorio, y los
rangos publicados junto a ellos son citas con una fuente, no un veredicto.

Por qué la aplicación no es un producto sanitario según el [MDR](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) y la guía
[MDCG 2019-11](https://health.ec.europa.eu/document/download/b45335c5-1679-4c71-a91c-fc7a4d37f12b_en) se explica en la [autoevaluación](self-assessment.md#regulation).

Consulte siempre a un médico antes de tomar cualquier decisión sobre su salud.

## Cuando algo se lee mal

Un reconocimiento de texto lee una fotografía, y las fotografías a veces se leen mal. Tres cosas
ayudan, en este orden:

1. **Comparar con el papel.** La página y la línea que figuran debajo de cada valor están ahí
   para esto. Toque el valor para corregirlo; la corrección se guarda junto a la
   lectura.
2. **Volver a leer con esta versión**, en el menú del informe, tras una actualización de la
   aplicación: las páginas se conservan, de modo que un lector mejor puede volver a leerlas. Una
   relectura que encuentre menos valores de los guardados se descarta y nunca se guarda
   encima de la lectura mejor.
3. **Notificar valores que faltan**, en el menú del informe, envía las etiquetas de las
   filas que la aplicación no pudo codificar, nunca sus números, para que el diccionario pueda
   aprender la grafía del laboratorio. **Exportar diagnósticos** le entrega un
   archivo con el texto reconocido para adjuntarlo a una
   [incidencia](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186);
   solo sale del teléfono a través de la hoja de compartir, cuando usted lo envía.

## Cómo se hacen estas capturas de pantalla

Las imágenes de esta guía se toman en un simulador con
[`clients/ios/Scripts/capture-screenshots.sh`](../../clients/ios/Scripts/capture-screenshots.sh),
que abre la aplicación directamente en cada pantalla con el conjunto de datos de desarrollo
ficticio:

```bash
cd clients/ios
SEED=-MBDevData OUT=/tmp/shots \
  SCREENS="list detail scan trends reference history profile consent settings privacy consents connect" \
  Scripts/capture-screenshots.sh
for f in /tmp/shots/*.png; do sips --resampleWidth 660 "$f" --out "../../docs/klarbefund/img/$(basename "$f")"; done
```

El conjunto de datos se construye en el código, en memoria, y queda excluido de una compilación
de producción. Cada laboratorio y cada consulta que contiene son inventados y cada valor es
ficticio, y esa es la única razón por la que una captura de pantalla puede llegar a hacerse commit: la regla de la
[guía para desarrolladores](developer-guide.md#two-rules-that-are-not-negotiable) es
que ningún dato de salud real entra en el repositorio, ni siquiera como imagen, ni siquiera
temporalmente.
