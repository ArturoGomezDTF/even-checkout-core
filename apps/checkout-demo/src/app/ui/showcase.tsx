"use client";

import {
  Badge,
  Button,
  Card,
  Checkbox,
  Container,
  EvenAsterisk,
  FullScreenLoader,
  IconButton,
  Input,
  Modal,
  Radio,
  Screen,
  Spinner,
  Stack,
  Textarea,
} from "@even/ui";
import { useState, type ReactNode } from "react";

const brandColors = [
  ["even-grass", "bg-even-grass"],
  ["even-evergreen", "bg-even-evergreen"],
  ["even-shamrock", "bg-even-shamrock"],
  ["even-aqua", "bg-even-aqua"],
  ["even-offwhite", "bg-even-offwhite"],
  ["even-ink", "bg-even-ink"],
  ["surface", "bg-surface"],
  ["stroke-soft", "bg-stroke-soft"],
  ["muted", "bg-muted"],
  ["danger", "bg-danger"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// Catálogo visual de @even/ui. Sirve para revisar cambios del paquete y como base de los E2E.
export function UiShowcase() {
  const [modalOpen, setModalOpen] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const emailError = email && !email.includes("@") ? "Escribe un correo válido" : undefined;

  function simulatePayment() {
    setPaying(true);
    setTimeout(() => setPaying(false), 1500);
  }

  function showLoader() {
    setLoaderOpen(true);
    setTimeout(() => setLoaderOpen(false), 1500);
  }

  return (
    <Screen>
      <Container width="md" className="py-10">
        <Stack gap="lg">
          <header className="flex items-center gap-3">
            <EvenAsterisk className="size-10 text-even-evergreen" title="Even" />
            <div>
              <h1 className="text-3xl font-semibold">@even/ui</h1>
              <p className="text-sm text-muted">Primitivas compartidas por las apps de Even.</p>
            </div>
          </header>

          <Section title="Colores">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {brandColors.map(([name, bg]) => (
                <div key={name} className="flex flex-col gap-1">
                  <div className={`h-12 rounded-lg border border-stroke-soft/50 ${bg}`} />
                  <span className="text-xs">{name}</span>
                </div>
              ))}
            </div>
            <p>
              Texto con <span className="even-highlight">highlight de marca</span> sobre Offwhite.
            </p>
          </Section>

          <Section title="Botones">
            <div className="flex flex-wrap gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button disabled>Disabled</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <Button size="lg" fullWidth loading={paying} onClick={simulatePayment}>
              {paying ? "Procesando…" : "Pagar $250.00"}
            </Button>
            <div className="flex items-center gap-3">
              <IconButton aria-label="Quitar uno" onClick={() => setQuantity((q) => Math.max(0, q - 1))}>
                −
              </IconButton>
              <span className="w-6 text-center text-lg" aria-live="polite">
                {quantity}
              </span>
              <IconButton aria-label="Agregar uno" onClick={() => setQuantity((q) => q + 1)}>
                +
              </IconButton>
              <IconButton aria-label="Favorito" variant="primary" size="sm">
                ★
              </IconButton>
            </div>
            <Card variant="brand" className="flex flex-col gap-3">
              <p>Sobre fondo Evergreen se usa la variante light.</p>
              <Button variant="light" fullWidth>
                Volver al inicio
              </Button>
            </Card>
          </Section>

          <Section title="Formularios">
            <Input
              label="Correo"
              type="email"
              placeholder="tu@correo.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              hint="Te enviaremos el ticket aquí"
              error={emailError}
              leadingIcon={<span aria-hidden>@</span>}
            />
            <Input label="Nombre" placeholder="Como aparece en tu tarjeta" />
            <Textarea label="Notas para cocina" placeholder="Sin cebolla, por favor" />
            <div className="flex flex-col gap-3">
              <Checkbox label="Sin cebolla" />
              <Checkbox label="Extra queso" defaultChecked />
              <Checkbox label="Agotado" disabled />
            </div>
            <div className="flex flex-col gap-3" role="radiogroup" aria-label="Propina">
              <Radio name="tip" value="10" label="10%" defaultChecked />
              <Radio name="tip" value="15" label="15%" />
              <Radio name="tip" value="20" label="20%" />
            </div>
          </Section>

          <Section title="Badges y tarjetas">
            <div className="flex flex-wrap gap-2">
              <Badge>Grass</Badge>
              <Badge variant="soft">Soft</Badge>
              <Badge variant="aqua">Aqua</Badge>
              <Badge variant="evergreen">Evergreen</Badge>
              <Badge variant="neutral">Neutral</Badge>
              <Badge variant="soft" size="sm">
                Nuevo
              </Badge>
            </div>
            <Card>
              <h3 className="font-medium">Tacos al pastor</h3>
              <p className="text-sm text-muted">Orden de 4 con piña y cilantro.</p>
            </Card>
            <Card variant="surface" padding="sm">
              <p className="text-center font-medium">Abre mañana a las 9:00</p>
            </Card>
          </Section>

          <Section title="Feedback">
            <div className="flex items-center gap-4 text-even-shamrock">
              <Spinner size="sm" />
              <Spinner />
              <Spinner size="lg" />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => setModalOpen(true)}>
                Abrir modal
              </Button>
              <Button variant="outline" onClick={showLoader}>
                Ver loader
              </Button>
            </div>
          </Section>
        </Stack>
      </Container>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Producto agotado"
        description="Tacos al pastor no está disponible por ahora."
        footer={
          <Button size="lg" fullWidth onClick={() => setModalOpen(false)}>
            Entendido
          </Button>
        }
      >
        <Card variant="surface" padding="sm">
          <p className="text-center font-medium">Elige otro platillo del menú</p>
        </Card>
      </Modal>

      {loaderOpen && <FullScreenLoader />}
    </Screen>
  );
}
