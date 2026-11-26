import { BarChart3, CalendarDays, Home, Menu, Plus } from 'lucide-react';
import { useState } from 'react';
import { ToastHost, useRoute } from './components/ui';
import { AddSheet } from './components/workout';
import Today from './screens/Today';
import Calendar from './screens/Calendar';
import Workout from './screens/Workout';
import Analysis from './screens/Analysis';
import Zones from './screens/Zones';
import Import from './screens/Import';
import PlanEditor from './screens/PlanEditor';
import AnnualPlan from './screens/AnnualPlan';
import Metrics from './screens/Metrics';
import Records from './screens/Records';
import More, { SettingsScreen } from './screens/More';

const TABS = [
  { to: 'hoy', label: 'Hoy', icon: Home, match: ['hoy'] },
  { to: 'calendario', label: 'Calendario', icon: CalendarDays, match: ['calendario', 'entreno', 'plan', 'constructor'] },
  { to: 'analisis', label: 'Análisis', icon: BarChart3, match: ['analisis'] },
  { to: 'mas', label: 'Más', icon: Menu, match: ['mas', 'zonas', 'importar', 'plan-anual', 'metricas', 'records', 'ajustes'] },
];

export default function App() {
  const [route, id] = useRoute();
  const [add, setAdd] = useState(false);
  let screen;
  switch (route) {
    case 'calendario': screen = <Calendar />; break;
    case 'entreno': screen = <Workout key={id} id={id} />; break;
    case 'plan': screen = <PlanEditor key={id} id={id} />; break;
    case 'constructor': screen = <PlanEditor key={location.hash} />; break;
    case 'analisis': screen = <Analysis />; break;
    case 'zonas': screen = <Zones />; break;
    case 'importar': screen = <Import />; break;
    case 'plan-anual': screen = <AnnualPlan />; break;
    case 'metricas': screen = <Metrics />; break;
    case 'records': screen = <Records />; break;
    case 'ajustes': screen = <SettingsScreen />; break;
    case 'mas': screen = <More />; break;
    default: screen = <Today />;
  }
  const tab = (t: (typeof TABS)[number]) => (
    <a key={t.to} href={`#/${t.to}`} aria-current={t.match.includes(route) ? 'page' : undefined}>
      <t.icon size={22} aria-hidden />
      {t.label}
    </a>
  );
  return (
    <div className="app">
      <main className="main">{screen}</main>
      <nav className="nav" aria-label="Principal">
        {tab(TABS[0])}
        {tab(TABS[1])}
        <button className="plus" aria-label="Añadir entreno" onClick={() => setAdd(true)}><span><Plus size={24} /></span></button>
        {tab(TABS[2])}
        {tab(TABS[3])}
      </nav>
      <AddSheet open={add} onClose={() => setAdd(false)} />
      <ToastHost />
    </div>
  );
}
