import { createRoot } from 'react-dom/client';
import { useRef } from 'react';
import { ContentEditor } from '@/components/members/editor/ContentEditor';
const initial = { root: { type: 'root', version: 1, direction: null, format: '', indent: 0, children: [
  { type: 'paragraph', version: 1, direction: null, format: '', indent: 0, textFormat: 0, textStyle: '', children: [
    { type: 'text', version: 1, detail: 0, format: 0, mode: 'normal', style: '', text: '雪還薄，' }] }] } };
function App() {
  const handle = useRef(null);
  window.readDoc = () => handle.current.read();
  return <ContentEditor initialContent={initial} onChange={() => {}} onPendingChange={() => {}} handleRef={handle} ownerId={1} />;
}
createRoot(document.getElementById('root')).render(<App />);
