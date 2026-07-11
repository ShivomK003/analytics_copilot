import { useEffect, useState } from "react";
import api from "../services/api";

export function useMetrics() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api.get("/metrics").then((res) => {
      setData(res.data);
    });
  }, []);

  return data;
}