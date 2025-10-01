import { useState } from 'react';
import DeepResearchModal from '../DeepResearchModal';
import { Button } from '@/components/ui/button';

export default function DeepResearchModalExample() {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-background p-6">
      <Button onClick={() => setOpen(true)}>
        Show Deep Research Modal
      </Button>
      <DeepResearchModal
        open={open}
        onConfirm={() => {
          console.log('Confirmed deep research');
          setOpen(false);
        }}
        onUseFasterAlternative={() => {
          console.log('Using faster alternative');
          setOpen(false);
        }}
        estimatedTime="3-5 minutes"
      />
    </div>
  );
}
