"use client";

import { Suspense } from "react";
import DashboardView from "../components/DashboardView";
import Loader from "../components/UI/Loader";

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loader />}>
      <DashboardView />
    </Suspense>
  );
}
