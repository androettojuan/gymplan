# GymPlan

Planes de entrenamiento para gimnasios. El dueño y los profes arman los planes (en un editor o importando el PDF de siempre) y se los mandan a cada socio con un link. El socio entra con Google, ve su plan, anota sus pesos y ve su progreso.

- **App:** https://gymplan-ar.web.app
- **Diseño (roles, datos, invitaciones, reglas):** [DESIGN.md](DESIGN.md)

## Desarrollo

Requiere Node 22 (en WSL: `nvm use 22`).

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # compila en dist/
```

## Publicar

```bash
npm run build
firebase deploy --only hosting           # la app
firebase deploy --only firestore:rules   # las reglas de seguridad
```

Proyecto de Firebase: `gymplan-ar` (Authentication con Google, Firestore en `southamerica-east1`, Hosting).
