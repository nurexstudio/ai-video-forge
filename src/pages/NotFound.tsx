import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col bg-background"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md">
          {/* Neobrutalism 404 block */}
          <div className="inline-block border-2 border-black bg-white shadow-[6px_6px_0px_#000] p-8 mb-8">
            <h1 className="text-8xl md:text-9xl font-black leading-none tracking-tighter">
              404
            </h1>
          </div>

          <h2 className="text-2xl md:text-3xl font-black mb-4">
            Page Not Found
          </h2>

          <p className="text-muted-foreground font-medium mb-8">
            The page you're looking for doesn't exist or has been moved.
          </p>

          <Button
            variant="default"
            size="lg"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
