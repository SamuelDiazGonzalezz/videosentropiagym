# DECISIONES — Documental «Kevin Levrone» para Entropia Gym

Vídeo de 7:43 en 16:9 (1920×1080, 30 fps), con la locución de ElevenLabs, las 23 imágenes del cliente, el vídeo de entrenamiento adicional y el logo de Entropia Gym. Todo lo que no venía del cliente está hecho con código: animación, gráficos, música y efectos de sonido. No he usado ningún modelo de generación de imagen, vídeo ni audio.

---

## 1. Qué decidí y por qué

### Idea general
**Un documental deportivo sobrio, no un tráiler.** Tomé como referencia el tono de los documentales deportivos de plataforma: fondo casi negro, mucho aire, una sola idea por plano y tipografía grande que sigue a la voz. Los efectos aparecen solo cuando la narración los pide: un gráfico cuando se explica algo y un golpe tipográfico cuando la voz da un dato.

### Paleta (solo colores de la marca)
- La saqué del logo: negro violáceo `#09080C`, morado `#7E4FC0`, lila claro `#B89DE6`, morado profundo `#2A1744` y plata `#CFCBD6`.
- Los únicos degradados son velos negros que oscurecen la imagen para que se lea el texto, y la luz morada de la marca.
- Las fotos y los clips llevan un etalonaje común (algo más de contraste, menos saturación y sombras teñidas de morado). Así, 23 imágenes de fuentes muy distintas parecen de la misma película.

### Tipografía (3 familias, papeles fijos)
- **Anton**: titulares y cifras. Es condensada y pesada, como las portadas de revistas de culturismo de los 90.
- **Fraunces itálica**: la voz íntima y emocional (la madre, las preguntas, la cita final). El cambio a serifa avisa al espectador de que el tono cambia.
- **Oswald** espaciada: antetítulos pequeños, siempre en lila y con un trazo corto delante.
- Inter solo aparece en la interfaz genérica de foro y comentarios.
- Todas tienen licencia libre (OFL) y están incluidas en `assets/fonts`.

### Rejilla y márgenes
- Márgenes laterales de 120 px e inferior de 110 px, con rejilla de 12 columnas.
- Los textos de los planos de foto están siempre abajo a la izquierda.
- Los planos que son solo tipografía están centrados.
- Los planos de dato van a dos columnas: imagen a un lado y texto al otro.

### Curvas de animación
- Todo usa curvas de aceleración y frenado; no hay nada lineal ni rebotes.
- Los titulares entran por máscara, subiendo desde debajo de su propia línea.
- Las cifras de impacto usan una curva exponencial y frenan en seco, para que coincidan con los golpes de la música.

### Sincronía con la voz
- No había transcripción con tiempos, así que detecté las pausas del MP3 con `ffmpeg silencedetect` (134 pausas).
- Después asigné cada una de las 114 frases del guion a esas pausas con programación dinámica (`src/align.py`), comparando la duración esperada de cada frase con la real.
- Dentro de cada frase, el tiempo de cada palabra se reparte según el número de letras. Así salen las palabras que aparecen justo cuando la voz las dice: «música / actuación / negocios», «grande / lleno / brutal», los años 1992-1995-2000-2002…
- Los cortes de plano caen siempre en el inicio de una frase.

### Planos que explican (en lugar de solo ilustrar)
Cada idea del guion tiene un gráfico propio, dibujado con código:

| Idea del guion | Gráfico |
|---|---|
| El ascenso | Barras «una década» frente a «apenas unos años», sin fechas inventadas, con el hito de 1991 |
| La tarjeta profesional | Tarjeta que gira en 3D simulado, con reflejo |
| Mr. Olympia 1992 | Podio en perspectiva con los dos puestos que cita el guion |
| La revista | Portadas reales del cliente cayendo sobre una mesa |
| Los hombros | Anotaciones sobre la foto |
| «Desde cualquier ángulo» | Tres medallones con una escala que gira |
| Tamaño y simetría | Eje de simetría con medidas espejadas sobre la foto |
| La recuperación | Curva media frente a curva de Levrone (esquema sin cifras) |
| «Nada de rutinas complicadas» | Líneas enredadas que se enderezan en «clásicos / pesados / intensos» |
| Sesiones intensas pero cortas | Pocas barras altas frente a muchas barras bajas |
| La ecuación | Barra que se carga con un disco por cada término |
| 365 días frente a unas semanas | Calendario de 365 casillas: los rivales lo llenan entero, Kevin solo las últimas semanas |
| Los subcampeonatos | Línea de 1992 a 2003 que enciende los cuatro 2º puestos con contador |
| «Siempre a un paso» | Medida del escalón entre el 1 y el 2 |
| La lesión | Haz de fibras del pectoral que se desgarra |
| El regreso | Contador de años de 2003 a 2016 |
| La pregunta final | Balanza entre «entrenar todo el año» y «libertad» |

### El vídeo adicional
Lo usé, como pediste, sobre todo al principio:
- Apertura en frío de 4 s con cuatro cortes de entrenamiento en blanco y negro, que crecen con el subidón de la música.
- Fondos de los números del gancho («4», «+20»).
- La parte del método de entrenamiento.
- El montaje de «se encerraba en el gimnasio».
- Las miniaturas de «como si fuera una serie».

Extraje 18 tramos como secuencias de imágenes a 30 fps (`src/prep_clips.sh`). Así el render es exacto cuadro a cuadro y no depende de que el navegador busque bien en el vídeo.

### Logo
- **Entrada**: el remolino de la marca, el logo que crece con un brillo que lo cruza, y debajo «KEVIN LEVRONE» con el subtítulo *El hombre que pudo ser Míster Olympia*.
- **Cierre**: aparece con «Si te ha gustado el vídeo…» y se queda solo al final.
- El remolino del fondo es el motivo del propio logo, dibujado con 13 espirales irregulares a media resolución y desenfocadas. Así no parece una espiral hipnótica genérica.

### Música (sintetizada en `src/music.py`)
- **Base de documental**: progresión en re menor (Rem–Si♭–Fa–Do) con pads de armónicos desafinados, piano sintetizado, ostinato de pulsos y latido de bombo en los momentos de tensión.
- **Partes heavy a 96 BPM**: riff de guitarra con quintas distorsionadas y palm mute, bajo y batería en medio tiempo. Entran justo en los momentos clave:
  - el logo,
  - 1992,
  - el método de entrenamiento,
  - los rivales,
  - el regreso de 2016,
  - la cita final y el cierre.
- **Impactos y subidas** en los cortes clave: «Un novato.», «¿Y si…?», cada año de subcampeón, «Spoiler».
- **Silencio total** en «su madre muere de cáncer» y en «Parece el final de la historia…».
- **Mezcla**: la música baja unos 8 dB cuando habla la voz y el conjunto se normaliza a −14 LUFS, el estándar de YouTube.

### Determinismo
- La animación es una función pura `seek(t)` sobre una línea de tiempo: no guarda estado de un fotograma a otro.
- El grano y la música usan generadores con semilla fija (`mulberry32` en JS y `numpy.default_rng(semilla)` en Python). No hay ningún `Math.random`.
- `src/render.mjs` abre Chromium, llama a `seek(f/30)` para cada fotograma y manda el JPEG a ffmpeg. Se reparte en 4 procesos en paralelo, porque como cada fotograma es independiente se puede renderizar en cualquier orden.

---

## 2. Qué descarté

| Descartado | Por qué |
|---|---|
| Barras de cine arriba y abajo | Las pediste fuera: cuentan como bordes |
| Glitch, aberración cromática, destellos, partículas | Lo pediste fuera y además abarata el tono documental |
| Un mapa de EE. UU. dibujado | No tenía datos de contorno fiables; lo cambié por la fecha grande y las coordenadas reales de Baltimore |
| Contar los hermanos con puntos | El guion no da la cifra y no quería inventar un dato |
| Puestos del Olympia año a año en una gráfica | Solo muestro los cuatro 2º puestos que dice el guion; no me invento el resto |
| Comentarios con texto inventado en el foro | Lo pediste fuera («sin frases de relleno»): el único texto real es la pregunta del guion y el resto son barras neutras |
| La interfaz real de YouTube (botón rojo, campana) | Lo pediste fuera: los botones son genéricos, en morado de la marca |
| Recortar a Kevin del fondo con un modelo de segmentación | Es IA; solo recorté por código el trofeo y el bote, que tenían fondo blanco liso |
| Fotos y clips a pantalla completa con zoom | Se veían borrosos, porque los originales tienen poca resolución; ahora tienen un límite de ampliación y se muestran como tarjetas |
| Clips con la bandera del techo y el cartel «Just do it» | Los cambié por otros tramos, para que no salga el eslogan de una marca real |
| Mostrar en pantalla la frase final del audio | El audio y tu texto dicen «Nos vemos en el **ikea**». Parece una errata o una broma, así que en pantalla solo dejo el logo |

---

## 3. Iteraciones

1. **Análisis**: hojas de contactos de las 23 imágenes y del vídeo adicional (un fotograma cada 4 s) para elegir los tramos, y detección del recuadro negro lateral del vídeo (es 4:3 dentro de 16:9).
2. **Sincronía**: detección de pausas y alineación de las 114 frases. La comprobé viendo que las pausas más largas caían en los cambios de párrafo.
3. **Música v1**: síntesis completa. Revisé la forma de onda: las secciones heavy y los silencios caen donde tocaba.
4. **Motor v1 y hoja de contactos de 154 fotogramas** (uno cada 3 s). Encontré:
   - clips lavados por el tinte que aclaraba los negros;
   - textos fuera de margen (revistas, «tiempo récord», «constancia»);
   - solapes en la ecuación de la barra;
   - el comentario cortando la palabra «fue»;
   - la cabeza de Coleman fuera de cuadro;
   - el trofeo y la creatina con fondo blanco;
   - un tramo con la bandera del techo y otro con un eslogan de marca;
   - el remolino demasiado hipnótico;
   - tildes que asomaban durante la animación de los titulares;
   - planos que se quedaban vacíos al empezar;
   - un cierre pequeño.
5. **Motor v2**: corregí todo lo anterior. En la segunda hoja de contactos quedaban dos cosas: huecos blancos dentro del trofeo y la pregunta solapada con su título. El primer arreglo del trofeo hacía agujeros en los brillos del bronce, así que lo cambié para que solo quite las zonas blancas grandes.
6. **Comprobación a tamaño grande** de los fotogramas clave: logo y título, «Un novato.», «En su primer Olympia.», el contador de 2016, el trofeo Sandow y el cierre.
7. **Render final** y nueva hoja de contactos sacada del propio MP4.
8. **Revisión con tus comentarios.**
   - **2:32, «brazos»**: la foto que usaba resaltaba en realidad una pierna. La cambié por la foto del tríceps, con la anotación sobre el brazo, y quité la foto anterior del montaje.
   - **Nitidez**: muchas fotos (de 340 a 650 px de origen) y los clips (480×352) se mostraban a pantalla completa y con zoom, ampliados entre 3 y 5 veces. Añadí una regla general en el motor: ninguna foto se amplía más de 1,6× su tamaño original ni ningún clip más de 2×. Si un plano necesita más, la imagen se muestra como tarjeta a tamaño nítido, con sombra, sobre un fondo desenfocado de sí misma. La regla se guía por el tamaño real de cada original, que `prep_assets.py` guarda en `assets/img/meta.json`.
   - **Zooms**: el Ken Burns pasa de hasta 1,35× a un máximo de 1,04×. Los medallones de «desde cualquier ángulo» se amplían menos.
   - **Solapes**: desplacé las tarjetas de «1992», «2003» y «51 años» para que no tapen el texto.

---

## 4. Tiempo total

Unos **45 minutos** de reloj en la primera entrega (de las 18:06 a las 18:50 UTC), más unos 35 minutos de la revisión 8:
- análisis y sincronía: 8 min;
- música: 4 min;
- motor y planos: 10 min;
- revisiones y correcciones: 8 min;
- render (13 min con 4 procesos) y versión web: 15 min.

Se entregan dos MP4:
- **Máster**: `salida/kevin_levrone_entropia_gym.mp4`, 438 MB, CRF 17.
- **Web, para subir a YouTube**: `salida/kevin_levrone_entropia_gym_web.mp4`, 117 MB, CRF 23 con ajuste para conservar el grano.

Ninguno está en git porque superan el límite de GitHub.

---

## 5. Cómo volver a generarlo

Desde `video-kevin-levrone/`, con `work/` conteniendo `voz.mp3`, `clip.mp4` y el zip de imágenes descomprimido en `work/zip/`.

1. Detectar las pausas de la voz:
   ```bash
   ffmpeg -i work/voz.mp3 -af silencedetect=noise=-40dB:d=0.3 -f null - 2>&1 | grep -oE "silence_(start|end): [0-9.]+" > work/sil.txt
   ```
2. Alinear el guion con la voz:
   ```bash
   python3 src/align.py
   ```
3. Preparar las imágenes y los recortes:
   ```bash
   python3 src/prep_assets.py
   ```
4. Extraer los tramos del vídeo adicional:
   ```bash
   bash src/prep_clips.sh
   ```
5. Generar la música y la mezcla:
   ```bash
   python3 src/music.py
   ```
6. Revisar con una hoja de contactos (un fotograma cada 3 s):
   ```bash
   node src/render.mjs sheet 3
   ```
7. Renderizar el vídeo completo:
   ```bash
   node src/render.mjs video 4
   ```

El MP4 sale en `salida/kevin_levrone_entropia_gym.mp4`.
