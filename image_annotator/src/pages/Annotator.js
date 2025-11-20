import React, { useState, useRef, useEffect } from 'react';
import OpenSeadragon from "openseadragon";

const Annotator = () => {
  const [annotations, setAnnotations] = useState([]);
  const [annotation, setAnnotation] = useState({}); // Current annotation being drawn/edited
  const [dziUrl, setDziUrl] = useState(null);
  const viewerRef = useRef(null);

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const isSpacePressedRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        // Prevent default scrolling behavior if focus is not on an input
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

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:5000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setDziUrl(data.dzi_url);
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  useEffect(() => {
    if (!dziUrl) return;

    // Initialize OpenSeadragon
    const viewer = OpenSeadragon({
      id: "osd-viewer",
      prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/2.4.2/images/",
      tileSources: dziUrl,
      showNavigator: false,
      gestureSettingsMouse: {
        clickToZoom: false
      }
    });

    viewerRef.current = viewer;

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [dziUrl]);

  // Manage MouseTracker for drawing
  useEffect(() => {
    if (!viewerRef.current || !isDrawingMode) return;

    const viewer = viewerRef.current;
    const mouseTracker = new OpenSeadragon.MouseTracker({
      element: viewer.canvas,
      pressHandler: (event) => {
        // Disable drawing if Space is pressed (Panning mode)
        if (isSpacePressedRef.current) return;
        const viewportPoint = viewer.viewport.pointFromPixel(event.position);
        setAnnotation({
          geometry: {
            x: viewportPoint.x,
            y: viewportPoint.y,
            width: 0,
            height: 0,
            type: "RECTANGLE"
          },
          selection: {
            mode: "DRAWING",
            anchorX: viewportPoint.x,
            anchorY: viewportPoint.y
          }
        });
      },
      dragHandler: (event) => {
        if (isSpacePressedRef.current) return;
        setAnnotation(prev => {
          if (!prev.selection || prev.selection.mode !== "DRAWING") return prev;

          const viewportPoint = viewer.viewport.pointFromPixel(event.position);

          const width = viewportPoint.x - prev.selection.anchorX;
          const height = viewportPoint.y - prev.selection.anchorY;

          return {
            ...prev,
            geometry: {
              ...prev.geometry,
              x: width > 0 ? prev.selection.anchorX : viewportPoint.x,
              y: height > 0 ? prev.selection.anchorY : viewportPoint.y,
              width: Math.abs(width),
              height: Math.abs(height),
            }
          };
        });
      },
      releaseHandler: (event) => {
        if (isSpacePressedRef.current) return;
        setAnnotation(prev => {
          if (!prev.selection || prev.selection.mode !== "DRAWING") return prev;

          // Auto-save the annotation immediately
          const newAnnotation = {
            geometry: prev.geometry,
            data: {
              text: "", // No text required
              id: Math.random()
            }
          };

          setAnnotations(currentAnnotations => [...currentAnnotations, newAnnotation]);

          // Also, exit drawing mode
          setIsDrawingMode(false);

          return {}; // Clear current annotation
        });
      }
    });

    return () => {
      mouseTracker.destroy();
    };
  }, [isDrawingMode, dziUrl]);

  // Update viewer mouse nav enabled state based on mode
  useEffect(() => {
    if (viewerRef.current) {
      // Enable nav if NOT drawing OR if Space is pressed
      const shouldEnableNav = !isDrawingMode || isSpacePressed;
      viewerRef.current.setMouseNavEnabled(shouldEnableNav);

      // Update cursor
      if (isDrawingMode) {
        viewerRef.current.canvas.style.cursor = isSpacePressed ? 'grab' : 'crosshair';
      } else {
        viewerRef.current.canvas.style.cursor = 'default';
      }
    }
  }, [isDrawingMode, isSpacePressed, dziUrl]);

  // Function to add overlays for annotations
  useEffect(() => {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;

    // Clear existing overlays (except the one being drawn if any, though simpler to clear all and redraw)
    viewer.clearOverlays();

    // Render saved annotations
    annotations.forEach((anno, index) => {
      const element = document.createElement("div");
      element.style.border = "2px solid red";
      element.style.position = "absolute";
      element.id = `annotation-${index}`;

      // Label removed as per request

      viewer.addOverlay({
        element: element,
        location: new OpenSeadragon.Rect(anno.geometry.x, anno.geometry.y, anno.geometry.width, anno.geometry.height)
      });
    });

    // Render current drawing annotation
    if (annotation.geometry) {
      const element = document.createElement("div");
      element.style.border = "2px solid red";
      element.style.position = "absolute";

      viewer.addOverlay({
        element: element,
        location: new OpenSeadragon.Rect(annotation.geometry.x, annotation.geometry.y, annotation.geometry.width, annotation.geometry.height)
      });
    }

  }, [annotations, annotation, dziUrl]); // Re-run when annotations change

  return (
    <div className="flex flex-col h-screen">
      <div className="p-4 bg-gray-100 border-b border-gray-300 flex justify-between items-center">
        <h1 className="text-xl font-bold">SVS Image Annotator</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsDrawingMode(!isDrawingMode)}
            className={`px-4 py-2 rounded ${isDrawingMode ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'}`}
          >
            {isDrawingMode ? 'Stop Drawing' : 'Draw Annotation'}
          </button>
          <input type="file" accept=".svs" onChange={handleUpload} className="p-2 border rounded" />
        </div>
      </div>

      <div className="flex-grow relative">
        {dziUrl ? (
          <>
            <div id="osd-viewer" style={{ width: "100%", height: "100%", background: "black" }} />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Please upload an .svs file to start annotating.
          </div>
        )}
      </div>
    </div>
  );
};

export default Annotator;
