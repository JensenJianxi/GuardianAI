import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { OpsCommandCenter } from "./pages/OpsCommandCenter";
import { ManualReviewWorkspace } from "./pages/ManualReviewWorkspace";
import { ExecutiveOverview } from "./pages/ExecutiveOverview";
import { SensitivityControl } from "./pages/SensitivityControl";
import { SystemArchitecture } from "./pages/SystemArchitecture";
import { ClientTransfers } from "./pages/ClientTransfers";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: ExecutiveOverview },
      { path: "executive", Component: ExecutiveOverview },
      { path: "ops", Component: OpsCommandCenter },
      { path: "manual-review", Component: ManualReviewWorkspace },
      { path: "settings", Component: SensitivityControl },
      { path: "architecture", Component: SystemArchitecture },
      { path: "client", Component: ClientTransfers },
    ],
  },
]);
