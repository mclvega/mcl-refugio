# McL Refugio

Juego de supervivencia en 3D para el navegador, en tercera persona. Despiertas solo en una isla boscosa. De día recolectas, cazas, fabricas herramientas y levantas tu refugio. De noche, los salvajes del bosque atacan en oleadas cada vez más grandes. El objetivo es **sobrevivir el mayor número de días**: no hay final.

- **Ciclo de día (3 min) y noche (2 min)**, con el sol que se pone, aviso antes de la noche y guardado al amanecer.
- **Supervivencia**: vida, hambre y sed (se pueden desactivar en Configuración). Bebes en los lagos, comes bayas o carne asada en la hoguera y te curas con vendas.
- **Recursos**: troncos y palos de los árboles (que vuelven a crecer), piedras de las rocas, bayas y fibras de los arbustos, chatarra y cuerda de las cajas, y carne y hueso de los conejos y ciervos.
- **🎒 Mochila**: fabricas hacha de piedra, lanza, garrote de hueso, hacha mejorada, arco y flechas, vendas y antorchas.
- **🔨 Construir** sobre una rejilla de 2 m, con vista previa verde o roja y giro: hoguera, refugio (descansar y guardar), muro de troncos, puerta (tú pasas y ellos no), muro con pinchos, torre de vigía (dispara tus flechas) y trampa de pinchos. Las piezas se dañan y se reparan con troncos.
- **Enemigos**: Salvaje, Hondero (lanza piedras), Saltador (salta los muros), Rompedor (va a por la base) y el **Gigante del bosque** cada 5 noches.
- **🧠 Recuerdos**: al caer ganas recuerdos por los días sobrevividos y los Gigantes vencidos, y los gastas en mejoras permanentes.
- **👕 Personaje** con el mismo sistema que el Arcade.
- Teclado y ratón (WASD, clic golpear, Espacio esquivar, E usar, Tab mochila, B construir, R girar, Q arma), mando y controles táctiles.
- Funciona sin conexión (PWA) y el progreso queda en el navegador.

Publicado en https://mcl-refugio.netlify.app

## Desarrollo

```sh
npm install
npm run dev      # ?demo empieza una isla nueva; &base pone una base y recursos; &noche salta al anochecer; &dia=5 en ese día
npm test
npm run build
```

`src/core/*` es la lógica pura (isla por semilla, objetos y recetas, construcción, oleadas, recuerdos y dificultad). `src/game/logica.ts` es la partida y `src/game/render3d.ts` el dibujo con three.js.
