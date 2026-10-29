import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom no implementa scrollTo; unlockScroll lo llama al desmontar modales.
window.scrollTo = () => {};

afterEach(cleanup);
