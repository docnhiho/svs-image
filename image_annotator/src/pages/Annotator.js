import React, { useState, useRef, useEffect } from 'react';
import OpenSeadragon from "openseadragon";

const Annotator = () => {
  const [annotations, setAnnotations] = useState([]);
  const annotationsRef = useRef([]);
  useEffect(() => {
    annotationsRef.current = annotations;
  }, [annotations]);

  const [annotation, setAnnotation] = useState({});
  const [dziUrl, setDziUrl] = useState(null);
  const viewerRef = useRef(null);

  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const isDrawingModeRef = useRef(false); // Ref to access current state in event handlers without dependencies

  useEffect(() => {
    isDrawingModeRef.current = isDrawingMode;
  }, [isDrawingMode]);

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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedAnnotationId) {
          setAnnotations(prev => prev.filter(a => a.data.id !== selectedAnnotationId));
          setSelectedAnnotationId(null);
        }
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
  }, [selectedAnnotationId]);

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

    viewer.addHandler('canvas-click', (event) => {
      if (!event.quick) return;

      // Don't deselect if we are in drawing mode
      if (isDrawingModeRef.current) return;

      // Geometric hit testing
      const vp = viewer.viewport.pointFromPixel(event.position);
      const annos = annotationsRef.current;

      let foundId = null;
      // Iterate in reverse to find the top-most annotation
      for (let i = annos.length - 1; i >= 0; i--) {
        const anno = annos[i];
        const { x, y, width, height } = anno.geometry;
        if (vp.x >= x && vp.x <= x + width && vp.y >= y && vp.y <= y + height) {
          foundId = anno.data.id;
          break;
        }
      }

      setSelectedAnnotationId(foundId);
    });

    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [dziUrl]); // Removed isDrawingMode from dependencies

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
      el.className = "annotation-overlay"; // Add class for identification

      el.style.position = "absolute";
      el.style.border = anno.data.id === selectedAnnotationId ? "3px solid blue" : "2px solid red";
      // No onclick handler needed, handled by canvas-click geometric test
      el.style.cursor = "pointer";

      viewer.addOverlay({
        element: el,
        location: new OpenSeadragon.Rect(
          anno.data.id === selectedAnnotationId ? anno.geometry.x - 0.0005 : anno.geometry.x,
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

  }, [annotations, annotation, selectedAnnotationId]);

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
            disabled={!selectedAnnotationId}
            onClick={() => {
              if (selectedAnnotationId) {
                setAnnotations(prev => prev.filter(a => a.data.id !== selectedAnnotationId));
                setSelectedAnnotationId(null);
              }
            }}
            className={`px-4 py-2 rounded text-white ${!selectedAnnotationId ? "bg-gray-400" : "bg-red-600"}`}
          >
            Delete Selected
          </button>

          <button
            disabled={annotations.length === 0}
            onClick={() => setAnnotations(prev => prev.slice(0, -1))}
            className={`px-4 py-2 rounded text-white ${annotations.length === 0 ? "bg-gray-400" : "bg-gray-600"
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