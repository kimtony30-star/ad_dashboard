
// ═══════════════════════════════════════════════
// App.tsx 수정
// 기존 import 목록에 아래 줄 추가
// ═══════════════════════════════════════════════
import AiAnalysis from "@/pages/AiAnalysis";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Insights from "./pages/Insights";
import PublicView from "./pages/PublicView";
import UploadHistory from "./pages/UploadHistory";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/public"} component={PublicView} />
      <Route path={"/upload-history"} component={UploadHistory} />
      <Route path={"/insights"} component={Insights} />
      <Route path={"/ai-analysis"} component={AiAnalysis} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
