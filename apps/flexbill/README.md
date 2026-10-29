# 🍽️ Even Restaurant - Frontend

Un sistema de gestión de restaurante moderno y responsive construido con **Next.js 15**, **TypeScript** y **TailwindCSS**. Permite a los clientes ordenar desde la mesa mediante códigos QR y gestionar pagos de forma integrada.

## 📋 Tabla de Contenidos

- [🚀 Características](#-características)
- [🛠️ Tecnologías](#️-tecnologías)
- [📁 Estructura del Proyecto](#-estructura-del-proyecto)
- [🔧 Instalación](#-instalación)
- [📱 Páginas y Componentes](#-páginas-y-componentes)
- [🔄 Contextos de Estado](#-contextos-de-estado)
- [🧩 Hooks Personalizados](#-hooks-personalizados)
- [📡 Servicios y APIs](#-servicios-y-apis)
- [🔀 Flujos de Usuario](#-flujos-de-usuario)
- [💳 Sistema de Pagos](#-sistema-de-pagos)
- [📋 Sistema de Órdenes](#-sistema-de-órdenes)
- [🚀 Scripts de Desarrollo](#-scripts-de-desarrollo)

## 🚀 Características

### ✨ Funcionalidades Principales

- **🔍 NFC**: Los clientes acercan su dispositivo con el NFC activo a la tarjeta de la mesa
- **📖 Menú Digital**: Navegación intuitiva por categorías y platillos
- **🛒 Carrito Inteligente**: Gestión de items por usuario en tiempo real
- **👥 Multi-Usuario**: Múltiples personas pueden ordenar en la misma mesa
- **💳 Pagos Integrados**: Procesamiento de pagos con EcartPay
- **📊 Estado de Órdenes**: Seguimiento en tiempo real del estado de pedidos
- **🎯 Sistema de Propinas**: Cálculo automático y opciones personalizadas
- **📱 PWA Ready**: Instalable como aplicación móvil

### 🔐 Características Técnicas

- **TypeScript**: Tipado estático para mayor robustez
- **Server Components**: Renderizado optimizado del lado del servidor
- **Estado Global**: Gestión centralizada con Context API
- **Responsive Design**: Adaptable a todos los dispositivos
- **Real-time Updates**: Sincronización automática de órdenes
- **Error Handling**: Manejo robusto de errores y estados de carga

## 🛠️ Tecnologías

| Tecnología       | Versión  | Propósito                 |
| ---------------- | -------- | ------------------------- |
| **Next.js**      | 15.5.0   | Framework principal React |
| **React**        | 19.1.0   | Biblioteca UI             |
| **TypeScript**   | ^5       | Tipado estático           |
| **TailwindCSS**  | ^4       | Estilos y diseño          |
| **Clerk**        | ^6.31.10 | Autenticación (opcional)  |
| **Lucide React** | ^0.544.0 | Iconografía               |
| **Next PWA**     | ^5.6.0   | Funcionalidad PWA         |

## 📁 Estructura del Proyecto

```
even-flexbill/
├── app/                          # App Router de Next.js 15
│   ├── (pages)/                  # Páginas principales
│   │   ├── add-card/            # Agregar método de pago
│   │   ├── add-tip/             # Agregar propina
│   │   ├── cart/                # Carrito de compras
│   │   ├── checkout/            # Proceso de pago
│   │   ├── choose-to-pay/       # Selección de método de pago
│   │   ├── dashboard/           # Panel administrativo
│   │   ├── dish/[id]/          # Detalle de platillo
│   │   ├── menu/               # Menú principal
│   │   ├── order/              # Estado de órdenes
│   │   ├── payment/            # Procesamiento de pagos
│   │   ├── payment-success/    # Confirmación de pago
│   │   ├── select-items/       # Selección de items
│   │   ├── select-total-pay/   # Selección de total a pagar
│   │   ├── sign-in/           # Iniciar sesión
│   │   ├── sign-up/           # Registro
│   │   ├── table/             # Gestión de mesas
│   │   └── user/              # Perfil de usuario
│   │
│   ├── components/              # Componentes reutilizables
│   │   ├── CartView.tsx        # Vista del carrito
│   │   ├── CheckoutModal.tsx   # Modal de checkout
│   │   ├── MenuCategory.tsx    # Categorías del menú
│   │   ├── MenuHeader.tsx      # Header del menú
│   │   ├── MenuHeaderBack.tsx  # Header con botón de regreso
│   │   ├── MenuItem.tsx        # Item individual del menú
│   │   ├── MenuView.tsx        # Vista principal del menú
│   │   └── OrderStatus.tsx     # Estado de órdenes
│   │
│   ├── context/                # Contextos de estado global
│   │   ├── CartContext.tsx     # Estado del carrito
│   │   ├── GuestContext.tsx    # Gestión de usuarios invitados
│   │   ├── PaymentContext.tsx  # Estado de pagos
│   │   └── TableContext.tsx    # Estado de la mesa
│   │
│   ├── hooks/                  # Hooks personalizados
│   │   ├── useEcartPay.ts     # Integración con EcartPay
│   │   ├── useTableNavigation.ts # Navegación con mesa
│   │   └── useUserSync.js     # Sincronización de usuarios
│   │
│   ├── interfaces/             # Definiciones de tipos
│   │   ├── category.ts        # Tipos de categorías
│   │   ├── menuItemData.ts    # Tipos de items del menú
│   │   └── restaurante.ts     # Tipos del restaurante
│   │
│   ├── services/              # Servicios de API
│   │   └── tableApi.ts        # API de gestión de mesas
│   │
│   ├── types/                 # Tipos adicionales
│   │
│   ├── utils/                 # Utilidades
│   │   ├── api.ts            # Cliente API general
│   │   ├── menuData.ts       # Datos del menú
│   │   └── restaurantData.ts # Datos del restaurante
│   │
│   ├── globals.css           # Estilos globales
│   ├── layout.tsx           # Layout principal
│   └── page.tsx             # Página de inicio
│
├── package.json             # Dependencias y scripts
└── README.md               # Documentación
```

## 🔧 Instalación

### Prerrequisitos

- **Node.js** >= 18.0.0
- **npm** o **yarn**
- **Backend API** corriendo en puerto 5000

### Pasos de Instalación

1. **Clonar el repositorio**

   ```bash
   git clone <repository-url>
   cd even-flexbill
   ```

2. **Instalar dependencias**

   ```bash
   npm install
   # o
   yarn install
   ```

3. **Configurar variables de entorno**

   ```bash
   # Crear archivo .env.local
   NEXT_PUBLIC_API_URL=http://localhost:5000/api
   ```

4. **Ejecutar en desarrollo**

   ```bash
   npm run dev
   # o
   yarn dev
   ```

5. **Abrir en el navegador**
   ```
   http://localhost:3000
   ```

## 📱 Páginas y Componentes

### 🏠 Páginas Principales

#### **Página de Inicio (`/`)**

- Pantalla de bienvenida
- Entrada mediante escaneo QR o selección manual de mesa

#### **Menú (`/menu`)**

- Navegación por categorías
- Lista de platillos con imágenes y descripciones
- Agregado directo al carrito

#### **Carrito (`/cart`)**

- Resumen de items seleccionados
- Edición de cantidades
- Cálculo de totales

#### **Checkout (`/checkout`)**

- Selección de usuarios que pagan
- División de cuenta
- Iniciar proceso de pago

#### **Agregar Propina (`/add-tip`)**

- Selección de porcentaje de propina
- Monto personalizado
- Cálculo automático del total

#### **Estado de Órdenes (`/order`)**

- Visualización de órdenes activas
- Estado en tiempo real (En cocina, En camino, Entregado)
- Total de la mesa

### 🧩 Componentes Clave

#### **MenuHeader**

```tsx
// Componente de header principal
<MenuHeader restaurant={restaurantData} tableNumber={tableNumber} />
```

#### **MenuItem**

```tsx
// Item individual del menú
<MenuItem item={menuItem} onAddToCart={handleAddToCart} />
```

#### **OrderStatus**

```tsx
// Estado de órdenes con filtrado automático
<OrderStatus />
```

## 🔄 Contextos de Estado

### 🍽️ TableContext

**Ubicación**: `app/context/TableContext.tsx`

Gestiona el estado global de la mesa, órdenes y usuarios.

```tsx
interface TableState {
  tableNumber: string;
  orders: UserOrder[];
  currentUserName: string;
  currentUserItems: CartItem[];
  currentUserTotalItems: number;
  currentUserTotalPrice: number;
  isLoading: boolean;
  error: string | null;
  skipAutoLoad: boolean;
}
```

**Funciones principales**:

- `submitOrder()`: Enviar orden al servidor
- `refreshOrders()`: Actualizar órdenes de la mesa
- `markOrdersAsPaid()`: Marcar órdenes como pagadas
- `loadTableOrders()`: Cargar órdenes activas

### 🛒 CartContext

**Ubicación**: `app/context/CartContext.tsx`

Manejo del carrito individual del usuario.

### 👥 GuestContext

**Ubicación**: `app/context/GuestContext.tsx`

Gestión de usuarios invitados y sesiones temporales.

### 💳 PaymentContext

**Ubicación**: `app/context/PaymentContext.tsx`

Estado y configuración de pagos.

## 🧩 Hooks Personalizados

### 🔄 useTableNavigation

**Ubicación**: `app/hooks/useTableNavigation.ts`

Navegación manteniendo el contexto de la mesa.

```tsx
const { navigateWithTable, goBack } = useTableNavigation();

// Navegar manteniendo el número de mesa
navigateWithTable("/checkout");
```

### 💳 useEcartPay

**Ubicación**: `app/hooks/useEcartPay.ts`

Integración con el sistema de pagos EcartPay.

```tsx
const { processPayment, isLoading } = useEcartPay();
```

### 👤 useUserSync

**Ubicación**: `app/hooks/useUserSync.js`

Sincronización de usuarios en tiempo real.

## 📡 Servicios y APIs

### 🍽️ Table API Service

**Ubicación**: `app/services/tableApi.ts`

Cliente principal para la comunicación con el backend.

```tsx
class TableApiService {
  // Obtener órdenes de la mesa (solo pendientes)
  async getTableOrders(tableNumber: number): Promise<ApiResponse<UserOrder[]>>;

  // Crear nueva orden
  async createUserOrder(
    tableNumber: number,
    orderData: OrderData,
  ): Promise<ApiResponse<UserOrder>>;

  // Marcar órdenes como pagadas
  async markOrdersAsPaid(
    tableNumber: number,
    orderIds?: string[],
  ): Promise<ApiResponse<PaymentResult>>;

  // Obtener estadísticas de la mesa
  async getTableStats(tableNumber: number): Promise<ApiResponse<TableStats>>;
}
```

### 🔧 API Utils

**Ubicación**: `app/utils/api.ts`

Cliente API general con manejo de autenticación y errores.

## 🔀 Flujos de Usuario

### 🎯 Flujo Principal de Pedido

1. **Escanear QR** → Seleccionar Mesa
2. **Ver Menú** → Navegar por categorías
3. **Agregar Items** → Gestión del carrito
4. **Revisar Carrito** → Verificar selección
5. **Checkout** → Seleccionar usuarios que pagan
6. **Agregar Propina** → Cálculo de totales
7. **Procesar Pago** → Integración con EcartPay
8. **Confirmación** → Órdenes automáticamente marcadas como pagadas

### 💳 Flujo de Pago

1. **Selección de Total**: Usuario elige qué pagar
2. **Agregar Propina**: Selección de porcentaje o monto personalizado
3. **Método de Pago**: Selección o adición de tarjeta
4. **Procesamiento**: Integración con EcartPay
5. **Confirmación**: Actualización automática de órdenes

### 📋 Flujo de Órdenes

1. **Crear Orden**: `payment_status: 'pending'`
2. **Mostrar en Vista**: Solo órdenes con estado `pending`
3. **Completar Pago**: Auto-ejecución de `markOrdersAsPaid()`
4. **Actualizar Estado**: `payment_status: 'paid'` + `paid_at: timestamp`
5. **Ocultar Órdenes**: Filtrado automático, solo se muestran activas

## 💳 Sistema de Pagos

### 🔄 Estados de Pago

| Estado      | Descripción                  |
| ----------- | ---------------------------- |
| `pending`   | Orden creada, pago pendiente |
| `paid`      | Pago completado exitosamente |
| `refunded`  | Pago reembolsado             |
| `cancelled` | Pago cancelado               |

### 🎯 Integración Automática

El sistema marca automáticamente las órdenes como pagadas cuando:

1. **Pago directo exitoso** en `/add-tip`
2. **Retorno exitoso** desde EcartPay en `/payment-success`
3. **Verificación automática** de estado de pago

```tsx
// En handlePay de add-tip/page.tsx
if (paymentResult.success) {
  await handlePaymentSuccess(paymentId, totalAmount, "direct");
}

// En payment-success/page.tsx
useEffect(() => {
  if (paymentSuccessful) {
    await markOrdersAsPaid();
  }
}, [paymentSuccessful]);
```

## 📋 Sistema de Órdenes

### 📊 Filtrado Inteligente

Las órdenes se filtran automáticamente:

```tsx
// Backend: Solo órdenes pendientes
.eq('payment_status', 'pending')

// Frontend: Actualización automática después del pago
const handlePaymentSuccess = async () => {
  await markOrdersAsPaid(); // Marca como pagadas
  // Las órdenes desaparecen automáticamente de la vista
};
```

### 🔄 Estados de Órdenes

| Estado       | Descripción         | Color      |
| ------------ | ------------------- | ---------- |
| `On Kitchen` | En preparación      | 🟠 Naranja |
| `On its Way` | En camino a la mesa | 🔵 Azul    |
| `Delivered`  | Entregado           | 🟢 Verde   |

### 📈 Funcionalidades

- **Multi-usuario**: Varias personas ordenando en la misma mesa
- **Tiempo real**: Actualización automática de estados
- **Total de mesa**: Cálculo automático de totales generales
- **Historial**: Órdenes pagadas se mantienen en base de datos para reportes

## 🚀 Scripts de Desarrollo

```json
{
  "scripts": {
    "dev": "next dev --turbopack", // Desarrollo con Turbopack
    "build": "next build --turbopack", // Build optimizado
    "start": "next start", // Servidor de producción
    "lint": "eslint" // Linting de código
  }
}
```

### 🏃‍♂️ Comandos Útiles

```bash
# Desarrollo con hot-reload
npm run dev

# Build para producción
npm run build

# Iniciar servidor de producción
npm run start

# Verificar código
npm run lint
```

## 🔧 Configuración Adicional

### 🌐 Variables de Entorno

```env
# API Backend
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# Configuración del restaurante
NEXT_PUBLIC_RESTAURANT_LOGO=/logo.png

# EcartPay (opcional)
NEXT_PUBLIC_ECARTPAY_API_KEY=your_api_key
```

### 📱 PWA Configuration

El proyecto está configurado como PWA (Progressive Web App) con:

- **Service Worker** automático
- **Instalación** en dispositivos móviles
- **Funcionamiento offline** básico
- **Push notifications** (futuro)

---

## 🤝 Contribución

Para contribuir al proyecto:

1. Fork el repositorio
2. Crear una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

---

**Desarrollado con ❤️ para Even**
