import { motion, AnimatePresence } from "motion/react";
import { Cookie, X } from "lucide-react";
import React, { useEffect, useState } from "react";

const COOKIE_CONSENT_KEY = "hustle_arena_cookie_consent";

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    setIsVisible(false);
  };

  const handleReject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "rejected");
    setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="fixed bottom-6 left-6 right-6 z-[9999] mx-auto max-w-4xl"
        >
          <div className="overflow-hidden rounded-2xl border border-esport-accent/30 bg-esport-bg/95 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-xl md:p-8">
            <div className="relative flex flex-col items-center gap-6 md:flex-row md:gap-8">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-esport-accent/10 text-esport-accent">
                <Cookie size={32} />
              </div>
              
              <div className="flex-1 text-center md:text-left">
                <h3 className="text-xl font-display font-bold uppercase tracking-tight text-white md:text-2xl">
                  Cookie Control
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-esport-text-muted md:text-base">
                  We use cookies to enhance your arena experience, analyze battlefield performance, and provide high-stakes security. By continuing, you agree to our use of essential combat data.
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
                <button
                  onClick={handleReject}
                  className="esport-btn-secondary px-8 py-3 text-sm uppercase tracking-wider"
                >
                  Decline
                </button>
                <button
                  onClick={handleAccept}
                  className="esport-btn-primary px-8 py-3 text-sm uppercase tracking-wider shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                >
                  Accept All
                </button>
              </div>

              <button 
                onClick={() => setIsVisible(false)}
                className="absolute -right-2 -top-2 p-2 text-esport-text-muted hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
