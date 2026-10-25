import { useState } from "react";
import { MapPin, ChevronDown, Search, Check } from "lucide-react";
import { useApp } from "../../app/context";
import { Dialog } from "../ui/dialog";
import { ErrorMessage } from "../ui/shared";
export function ShopSelector() {
  const { shops, scope, locationName, setScope } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="shop-selector"
        onClick={() => setOpen(true)}
        aria-label={`Select location: ${locationName}`}
      >
        <MapPin size={16} />
        <span>{locationName}</span>
        <ChevronDown size={15} />
      </button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Choose a location"
        description="View one shop or all locations together."
      >
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Search locations"
            placeholder="Search locations…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {error && <ErrorMessage message={error} />}
        <div className="location-options">
          {[
            {
              id: "all",
              name: "All Locations",
              address: "Consolidated view",
              status: "active",
            },
            ...shops,
          ]
            .filter(
              (s) =>
                s.status === "active" &&
                s.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((s) => (
              <button
                className="location-option"
                key={s.id}
                onClick={async () => {
                  try {
                    await setScope(s.id);
                    setOpen(false);
                    setQuery("");
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.address || "Individual shop"}</small>
                </span>
                {scope === s.id && <Check size={18} />}
              </button>
            ))}
        </div>
      </Dialog>
    </>
  );
}
