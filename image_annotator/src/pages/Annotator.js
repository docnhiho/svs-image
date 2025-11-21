import React, { useState, useRef, useEffect } from 'react';
import OpenSeadragon from "openseadragon";

const Annotator = () => {
  const [annotations, setAnnotations] = useState([]);
  const [annotation, setAnnotation] = useState({});
  const [dziUrl, setDziUrl] = useState(null);
  const viewerRef = useRef(null);

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isSpacePressedRef = useRef(false);



  // -------------------------------------------------------
  // Space key to pan
  // -------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
        }
        setIsSpacePressed(true);
        isSpacePressedRef.current = true;
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        isSpacePressedRef.current = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // -------------------------------------------------------
  // Upload .svs
  // -------------------------------------------------------
  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:5000/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      setDziUrl(data.dzi_url);
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------
  // Init OpenSeadragon
  // -------------------------------------------------------
  useEffect(() => {
    if (!dziUrl) return;

    const viewer = OpenSeadragon({
      id: "osd-viewer",
      prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
      tileSources: dziUrl,
      gestureSettingsMouse: {
        clickToZoom: false
      }
    });

    viewerRef.current = viewer;

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [dziUrl]);

  // -------------------------------------------------------
  // Drawing
  // -------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current || !isDrawingMode) return;

    const viewer = viewerRef.current;

    const mouseTracker = new OpenSeadragon.MouseTracker({
      element: viewer.canvas,

      pressHandler: (event) => {
        if (isSpacePressedRef.current) return;

        const vp = viewer.viewport.pointFromPixel(event.position);

        setAnnotation({
          geometry: {
            x: vp.x,
            y: vp.y,
            width: 0,
            height: 0
          },
          selection: {
            mode: "DRAWING",
            anchorX: vp.x,
            anchorY: vp.y
          }
        });
      },

      dragHandler: (event) => {
        if (isSpacePressedRef.current) return;

        setAnnotation(prev => {
          if (!prev.selection || prev.selection.mode !== "DRAWING") return prev;

          const vp = viewer.viewport.pointFromPixel(event.position);

          const w = vp.x - prev.selection.anchorX;
          const h = vp.y - prev.selection.anchorY;

          return {
            ...prev,
            geometry: {
              x: w > 0 ? prev.selection.anchorX : vp.x,
              y: h > 0 ? prev.selection.anchorY : vp.y,
              width: Math.abs(w),
              height: Math.abs(h)
            }
          };
        });
      },

      releaseHandler: () => {
        if (isSpacePressedRef.current) return;

        setAnnotation(prev => {
          if (!prev.selection || prev.selection.mode !== "DRAWING") return prev;

          const newAnno = {
            geometry: prev.geometry,
            data: { id: Math.random() }
          };

          setAnnotations(a => [...a, newAnno]);
          setIsDrawingMode(false);
          return {};
        });
      }
    });

    return () => mouseTracker.destroy();
  }, [isDrawingMode]);

  // -------------------------------------------------------
  // Enable / disable pan
  // -------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current) return;
    viewerRef.current.setMouseNavEnabled(!isDrawingMode || isSpacePressed);
  }, [isDrawingMode, isSpacePressed]);

  // -------------------------------------------------------
  // Undo with Ctrl+Z
  // -------------------------------------------------------
  useEffect(() => {
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        setAnnotations(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  // -------------------------------------------------------
  // Render overlays
  // -------------------------------------------------------
  useEffect(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    viewer.clearOverlays();

    // Render saved annotations
    annotations.forEach((anno, index) => {
      const el = document.createElement("div");

      el.style.position = "absolute";
      el.style.border = "2px solid red";
      el.style.cursor = "default"; // No longer pointer since no selection

      viewer.addOverlay({
        element: el,
        location: new OpenSeadragon.Rect(
          anno.geometry.x,
          anno.geometry.y,
          anno.geometry.width,
          anno.geometry.height
        )
      });
    });

    // Render drawing rectangle
    if (annotation.geometry) {
      const el = document.createElement("div");
      el.style.position = "absolute";
      el.style.border = "2px solid red";

      viewer.addOverlay({
        element: el,
        location: new OpenSeadragon.Rect(
          annotation.geometry.x,
          annotation.geometry.y,
          annotation.geometry.width,
          annotation.geometry.height
        )
      });
    }

  }, [annotations, annotation]);

  // -------------------------------------------------------
  // UI
  // -------------------------------------------------------
  return (
    <div className="flex flex-col h-screen">
      <div className="p-4 bg-gray-100 border-b flex justify-between items-center">
        <h1 className="text-xl font-bold">SVS Annotator</h1>

        <div className="flex gap-3">
          <button
            onClick={() => setIsDrawingMode(!isDrawingMode)}
            className="px-4 py-2 bg-blue-500 text-white rounded"
          >
            {isDrawingMode ? "Stop Drawing" : "Draw Annotation"}
          </button>

          <button
            disabled={annotations.length === 0}
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            className={`px-4 py-2 rounded text-white ${annotations.length === 0 ? "bg-gray-400" : "bg-red-600"
              }`}
          >
            Undo
          </button>

          <input type="file" accept=".svs" onChange={handleUpload} />
        </div>
      </div>

      <div className="flex-grow">
        {dziUrl ? (
          <div id="osd-viewer" style={{ width: "100%", height: "100%", background: "black" }} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Upload .svs to start annotating
          </div>
        )}
      </div>
    </div>
  );
};

export default Annotator;