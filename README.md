# DiagClima · Diagnóstico de carga de refrigerante

PWA para técnicos frigoristas. Calcula **recalentamiento (SH)** y **subenfriamiento (SC)** a partir de presiones y temperaturas, diagnostica el estado de carga, calcula la **carga nominal** de la instalación y genera un **informe PDF** imprimible y compartible. Funciona **sin conexión**.

## Características

- **13 refrigerantes**: R32, R410A, R134a, R407C, R290, R404A, R448A, R449A, R452A, R454B, R513A, R1234yf, R1234ze.
- Tablas P/T con **bubble/dew** e interpolación lineal (mezclas zeotrópicas tratadas correctamente: SH con dew, SC con bubble).
- Unidades: **bar, psi, kPa, MPa** · presión relativa o absoluta · °C/°F.
- **Checklist previo obligatorio** (filtros, condensador, ventiladores, estabilización, tapas).
- **Diagnóstico por matriz SH×SC**: falta, sobrecarga, restricción en línea de líquido, compresor ineficiente, correcto. Con causas ordenadas por probabilidad y acciones recomendadas.
- **Calculadora de carga**: carga nominal = base de fábrica + Σ(metros × g/m por diámetro y refrigerante).
- **Informe PDF** con datos de empresa, cliente, mediciones, diagnóstico, carga, foto y firmas.
- **Historial** de intervenciones en el dispositivo (IndexedDB), con fotografía.
- Instalable en Android/iPhone como app.

## Uso local

Los service workers necesitan HTTP (no vale abrir el archivo con doble clic):

```bash
cd app-clima
python -m http.server 8000
# abrir http://localhost:8000
```

## Publicar en GitHub Pages (HTTPS, necesario para PWA)

1. Crea un repositorio en GitHub (por ejemplo `diagclima`).
2. Sube el contenido de esta carpeta:
   ```bash
   git remote add origin https://github.com/USUARIO/diagclima.git
   git branch -M main
   git push -u origin main
   ```
3. En GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. A los ~2 minutos estará en `https://USUARIO.github.io/diagclima/`.
5. Ábrela en el móvil → menú del navegador → **Añadir a pantalla de inicio**.

## Estructura

```
index.html            interfaz y flujo
css/styles.css        estilos
js/pt.js              motor P/T (carga tablas, interpola, convierte unidades)
js/calculator.js      SH, SC, Tevap, Tcond, lift, ΔT
js/diagnosis.js       matriz de diagnóstico, causas, acciones
js/charge.js          carga nominal y estimación de desvío
js/validation.js      validación de datos y coherencia
js/report.js          informe PDF / compartir
js/settings.js        datos de empresa
js/storage.js         historial (IndexedDB)
js/ui.js, js/app.js   render y orquestación
refrigerants/*.json   tablas P/T (bubble/dew)
manifest.json, service-worker.js   PWA + cache offline
```

## Precisión y límites (importante)

- La **carga nominal** es un cálculo exacto **si** la carga base y los g/m son los del fabricante. Los g/m por defecto se estiman a partir del volumen interno del tubo y la densidad del líquido: **prevalece siempre la tabla del fabricante**.
- El **desvío en gramos es una ESTIMACIÓN** y se da como rango. La cantidad real de refrigerante de un circuito **solo se conoce pesando**.
- En **VRF/multisplit** no se estiman gramos con una sola lectura: usar el modo de comprobación de carga del fabricante.
- Las tablas P/T de mezclas menos habituales (R448A, R449A, R452A) son **orientativas**: verificar contra la ficha del fabricante antes de un uso crítico.
- Herramienta de **ayuda al diagnóstico**. No sustituye los procedimientos del fabricante ni la normativa vigente (manipulación por personal certificado; prohibido liberar refrigerante a la atmósfera).
