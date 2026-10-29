# Even Pick & Go

Una plataforma de pedidos para llevar que permite a los clientes ordenar, pagar y recoger su comida de manera rápida y eficiente.

## Características

- 🍽️ **Menú digital interactivo** - Explora platillos con imágenes, descripciones y precios
- 📱 **Pedidos móviles** - Ordena desde tu smartphone de forma rápida y sencilla
- 💳 **Pagos seguros** - Integración con múltiples métodos de pago
- ⏰ **Tiempo de recogida** - Calcula automáticamente cuándo estará listo tu pedido
- 📍 **Localización** - Encuentra fácilmente el restaurante para recoger
- 🔔 **Notificaciones** - Recibe alertas cuando tu pedido esté listo

## Tecnologías

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Autenticación**: Clerk
- **Iconos**: Lucide React
- **Pagos**: React Payment Logos

## Instalación y configuración

1. Clona el repositorio:

```bash
git clone https://github.com/LetsEven/even-pick-and-go.git
cd even-pick-and-go
```

2. Instala las dependencias:

```bash
npm install
```

3. Configura las variables de entorno:

```bash
cp .env.example .env.local
# Edita .env.local con tus credenciales
```

4. Ejecuta el servidor de desarrollo:

```bash
npm run dev
```

5. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Scripts disponibles

- `npm run dev` - Ejecuta el servidor de desarrollo con Turbopack
- `npm run build` - Construye la aplicación para producción con Turbopack
- `npm start` - Ejecuta la aplicación en producción
- `npm run lint` - Ejecuta ESLint para revisar el código

## Estructura del proyecto

```
src/
├── app/                    # App Router de Next.js
├── components/            # Componentes reutilizables
├── context/              # Contextos de React
├── hooks/                # Custom hooks
├── services/             # Servicios y API calls
├── types/                # Definiciones de TypeScript
└── utils/                # Utilidades y helpers
```

## Flujo de usuario

1. **Explorar menú** - El cliente accede al menú digital
2. **Seleccionar platillos** - Agrega items al carrito
3. **Revisar orden** - Confirma los productos y cantidades
4. **Procesar pago** - Completa el pago de forma segura
5. **Recibir confirmación** - Obtiene tiempo estimado de preparación
6. **Recoger pedido** - Llega al restaurante a la hora indicada

## Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -m 'Agrega nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Abre un Pull Request

## Licencia

Este proyecto es propiedad de Even. Todos los derechos reservados.
