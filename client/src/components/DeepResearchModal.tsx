import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Zap } from "lucide-react";

interface DeepResearchModalProps {
  open: boolean;
  onConfirm: () => void;
  onUseFasterAlternative: () => void;
  estimatedTime: string;
}

export default function DeepResearchModal({
  open,
  onConfirm,
  onUseFasterAlternative,
  estimatedTime,
}: DeepResearchModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" data-testid="modal-deep-research">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-chart-4" />
            Deep Research Mode
          </DialogTitle>
          <DialogDescription>
            This request requires deep analysis and may take longer to process.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Estimated Time:</span>
              <span className="text-sm text-chart-4 font-semibold">{estimatedTime}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              The Deep Research model provides more comprehensive and thoughtful responses
              but requires additional processing time.
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            data-testid="button-faster-alternative"
            variant="outline"
            onClick={onUseFasterAlternative}
            className="w-full sm:w-auto"
          >
            <Zap className="h-4 w-4 mr-2" />
            Use Faster Alternative
          </Button>
          <Button
            data-testid="button-proceed"
            onClick={onConfirm}
            className="w-full sm:w-auto"
          >
            Proceed with Deep Research
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
