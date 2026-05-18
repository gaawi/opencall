# ADAR · Composer in Residence — Review App

App web estática y *mobile-first* para revisar de forma anónima los audios
de los candidatos al programa **Composer in Residence** del Festival ADAR.

Sin servidor, sin login, sin instalación. Todo corre en el navegador y el
progreso se guarda en `localStorage` (con exportación/importación a JSON).

---

## Cómo usarla

### 1. Abrir la app

Son tres archivos estáticos: `index.html`, `app.css`, `app.js`. Puedes:

- Abrir `index.html` directamente en el navegador, o
- Servir la carpeta:

  ```bash
  python3 -m http.server 8080
  # o
  npx serve .
  ```

  y abrir `http://localhost:8080`.

- Desplegarla en GitHub Pages, Netlify, Vercel, Cloudflare Pages…

### 2. Importar el archivo de candidatos

1. En **Inicio**, pulsa “Importar CSV o Excel”.
2. La app detecta automáticamente:
   - El número de filas
   - **Todos los audios** (cualquier celda cuyo valor sea una URL `.mp3`,
     `.wav`, `.m4a`, `.aac`, `.ogg` o `.flac`)
   - **Todos los PDFs** (cualquier celda cuyo valor sea una URL `.pdf`)
   - Las notas cortas que sigan a cada audio (p. ej. “bar 70 - minute 4:15”),
     que se muestran como **indicación del autor** al revisar.
3. Sólo tienes que indicar **qué columnas forman el nombre** (Nombre 1 y,
   opcionalmente, Nombre 2). Hay una casilla para invertir el orden si la
   primera columna es el apellido. Verás 3 ejemplos en directo debajo.
4. Pulsa **Confirmar e importar**.

### 3. Archivo del Festival ADAR (Tally)

El CSV oficial del Festival viene exportado desde Tally con columnas mal
etiquetadas. La app está pensada para eso: detecta el contenido, no los
nombres de columna.

- En el CSV cargado (`Festival ADAR 2026_Submissions_2026-05-18.csv`):
  - Columna **“Read the guidelines”** → primer nombre (¡sí, está mal
    etiquetada en la exportación de Tally!)
  - Columna **“Last name”** → apellido
- Selecciona como **Nombre 1** = `Read the guidelines` y **Nombre 2** =
  `Last name`. La app sugiere estas opciones por defecto.
- Detección automática: **79 compositores · 158 audios · 157 PDFs ·
  2 muestras por candidato.**

### 4. Revisar

- **Empezar revisión** elige un candidato aleatorio **aún no evaluado**
  y muestra sólo un código anónimo (`#XXXX`).
- El audio se precarga (`Cargando audio…`) antes de empezar.
- Contador grande de **2:00** que va bajando. Es **acumulado por
  candidato**: si pasas a la siguiente muestra, el contador sigue restando.
  Al llegar a 0, el audio se pausa automáticamente.
- Puedes mover el cursor del audio libremente.
- Si hay más de una muestra, aparecen botones **Muestra 1 / Muestra 2**
  para cambiar entre los audios del mismo compositor.
- Si el autor ha indicado un bar/minuto sugerido (p. ej. “Bar 1 (00:00)”),
  se muestra como `Indicación del autor: …`.
- Botones grandes: **Sí / Maybe / No**. Tras pulsar, salta automáticamente
  al siguiente candidato.
- **Siguiente** salta sin evaluar.
- **Ver PDF** abre la partitura/dossier en otra pestaña (todas las que
  tenga el candidato, empezando por la de la muestra actual).

### 5. Modo “Revisar maybes”

Botón aparte en Inicio. Sólo aparecen, también anónimos y al azar, los
candidatos cuyo último veredicto fue **Maybe**. Pueden cambiarse a Sí o No.
La nueva evaluación queda registrada como `attempt: "review"`.

### 6. Resultados

Pestaña arriba a la derecha. Verás:

- Tabla con nombre real, estado, número de revisiones, tiempo escuchado y
  enlaces a cada audio/PDF de cada muestra.
- Filtros: **Todos / Finalistas (Sí) / Maybes pendientes / No / Sin
  revisar**.
- **Exportar JSON** y **Exportar CSV**.

### 7. Progreso

- Se guarda automáticamente en el navegador.
- En **Avanzado** (Inicio) puedes **exportar** un JSON con todo el progreso
  (compositores + evaluaciones), **importarlo** en otro dispositivo, o
  borrar todo para reempezar.

---

## Sobre las URLs de Tally

Los enlaces de Tally Storage incluyen un token de acceso embebido. Para que
la app pueda reproducirlos directamente:

- Los enlaces deben ser válidos y no caducados (Tally suele renovarlos al
  re-exportar el CSV).
- Si la app está alojada en otro dominio, el servidor de Tally debe
  permitir CORS para reproducción `<audio>` cross-origin. En la práctica
  funcionan porque el elemento `<audio>` HTML5 carga binarios sin
  necesidad de CORS para reproducir (sólo para `fetch()`).
- Si un audio no carga, la entrada queda marcada como “Cargando audio…”
  indefinidamente; usa “Siguiente” y revísalo después por el enlace
  directo desde la pantalla de Resultados.

Para Dropbox/Drive (si en el futuro cambia la fuente):
- Dropbox: cambia `?dl=0` por `?raw=1`.
- Drive: usa `https://drive.google.com/uc?export=download&id=FILE_ID`.

---

## Estructura JSON interna

`localStorage` guarda esto bajo la clave `adar_composer_review_v2`:

```json
{
  "composers": [
    {
      "id": "sub_44W9b5O",
      "name": "MATTEO RIGOTTI",
      "samples": [
        {
          "audio_url": "https://storage.tally.so/private/diotima.mp3?...",
          "pdf_url":   "https://storage.tally.so/private/la-metamorfosi-del-canto-Score.pdf?...",
          "note":      "bar 70 - minute 4:15"
        },
        {
          "audio_url": "https://storage.tally.so/private/del-pulviscolo-di-ruggine..mp3?...",
          "pdf_url":   "https://storage.tally.so/private/del-pulviscolo-di-ruggine-copia-Score.pdf?...",
          "note":      "Bar 40 - minute 3:00"
        }
      ],
      "extra_pdfs": [],
      "raw": { "Submission ID": "44W9b5O", "Email": "...", "...": "..." }
    }
  ],
  "evaluations": {
    "sub_44W9b5O": [
      { "verdict": "maybe", "ts": "2026-05-18T17:42:11.230Z", "listenedSec": 95.3, "attempt": "first"  },
      { "verdict": "yes",   "ts": "2026-05-19T10:01:55.000Z", "listenedSec": 38.0, "attempt": "review" }
    ]
  }
}
```

El export `resultados.json` añade campos derivados (`status` y
`total_listened_sec`) por compositor.

---

## Lógica de finalistas

- `Sí` → finalista potencial
- `Maybe` → pendiente de segunda revisión
- `No` → descartado

“Dame los 10 finalistas” se puede hacer hoy filtrando por **Finalistas
(Sí)** en Resultados. La siguiente iteración puede añadir ranking
automático (por tiempo escuchado, recencia, doble confirmación, etc.).

---

## Privacidad

- Durante la revisión nunca se muestra el nombre, sólo un código anónimo
  derivado del `Submission ID` (o un hash si no existe).
- Los nombres reales sólo aparecen en la pantalla de **Resultados**.
- Email, teléfono y demás campos personales del CSV quedan en el campo
  `raw` del compositor pero no se muestran en ninguna pantalla.

---

## Stack

- HTML + CSS + JS vainilla (sin build, sin frameworks)
- [PapaParse](https://www.papaparse.com/) — CSV
- [SheetJS](https://sheetjs.com/) — Excel
- `localStorage` para persistencia
- Export JSON/CSV nativo (Blob + descarga)
