import React, { useState, useRef, useEffect } from "react";
import OpenSeadragon from "openseadragon";

const OpenSeadragonViewer = () => {
  const viewerRef = useRef(null);
  const [dziUrl, setDziUrl] = useState(null);

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("http://127.0.0.1:5000/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setDziUrl(data.dzi_url);
  };

  useEffect(() => {
    if (!dziUrl) return;
    const viewer = OpenSeadragon({
      id: "viewer",
      prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
      tileSources: dziUrl,
    });
    viewerRef.current = viewer;
    return () => viewerRef.current && viewerRef.current.destroy();
  }, [dziUrl]);

  return (
    <div>
      <input type="file" onChange={handleUpload} />
      {dziUrl && <div id="viewer" style={{ width: "100%", height: "500px" }} />}
    </div>
  );
};

export default OpenSeadragonViewer;

