import * as React from "react";
import "./App.css";
import * as firebase from "firebase";
import useLocalStorage from "react-use-localstorage";
import icon from "./moon-solid.svg";

export const App = () => {
  const photoTimeoutRef = React.useRef();
  const videoRef = React.useRef();
  const canvasRef = React.useRef();
  const pixelateHelperRef = React.useRef();
  const userRef = React.useRef();
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isShowingConfig, setIsShowingConfig] = React.useState(false);
  const [screenshotDelay, setScreenshotDelay] = useLocalStorage(
    "screenshotDelay",
    "30"
  );
  const [currentMeeting, setCurrentMeeting] = React.useState(null);
  const [shouldPixelate, setShouldPixelate] = useLocalStorage(
    "shouldPixelate",
    "true"
  );
  const [isAway, setIsAway] = React.useState(false);
  const [myPicture, setMyPicture] = React.useState(null);
  const [name, setName] = React.useState("");
  const [users, setUsers] = React.useState({});
  const rootRef = firebase.database();

  const setMySnapshot = data => {
    setMyPicture(data);
    if (userRef.current) {
      const userObj = rootRef.ref(`users/${userRef.current.uid}`);
      userObj.child("picture").set(data);
    }
  };

  React.useEffect(() => {
    setInterval(() => {
      if (userRef.current) {
        const userObj = rootRef.ref(`users/${userRef.current.uid}`);
        userObj.child("date").set(new Date().getTime());
      }
    }, 15 * 1000);
  }, []);

  const getSnapshot = cb => {
    let video = videoRef.current;
    let canvas = canvasRef.current;
    let webcamStream = null;

    if (!video || !canvas || isAway) {
      cb(null);
      return;
    }

    navigator.getMedia =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;

    navigator.getMedia(
      {
        video: true,
        audio: false
      },
      function(stream) {
        webcamStream = stream;
        video.srcObject = stream;
        video.play();

        let width = 320;
        let height = width / (4 / 3);

        video.setAttribute("width", width);
        video.setAttribute("height", height);
        canvas.setAttribute("width", width);
        canvas.setAttribute("height", height);

        setTimeout(() => {
          const context = canvas.getContext("2d");
          canvas.width = width;
          canvas.height = height;
          context.drawImage(video, 0, 0, width, height);

          const data = canvas.toDataURL("image/png");
          if (webcamStream.active) {
            webcamStream.getTracks()[0].stop();
          }
          cb(data);
        }, 3000);
      },
      function(err) {
        console.log("An error occured! " + err);
      }
    );
  };

  const connect = evt => {
    evt.preventDefault();
    firebase
      .auth()
      .signInAnonymously()
      .then(user => {
        user.updateProfile({
          displayName: name
        });
        firebase
          .database()
          .ref(`users/${user.uid}`)
          .child("name")
          .set(name);
      });
  };

  const logout = evt => {
    evt.preventDefault();
    firebase.auth().signOut();
  };

  const renderAuthenticate = () => {
    return (
      <form onSubmit={connect}>
        <input
          placeholder="name"
          value={name}
          onChange={evt => {
            setName(evt.target.value);
          }}
          className="input"
        />
        <input type="submit" value="Connect" className="button is-primary" />
      </form>
    );
  };

  const toggleConfig = e => {
    e.preventDefault();
    setIsShowingConfig(!isShowingConfig);
  };

  const getPixelated = (data, cb) => {
    let pixelateHelper = document.createElement("img");
    pixelateHelper.src = data;
    pixelateHelper.width = 320;
    pixelateHelper.id = "pixelatedImage";
    pixelateHelperRef.current.appendChild(pixelateHelper);
    setTimeout(() => {
      pixelateHelper.closePixelate([
        { shape: "diamond", resolution: 18, size: 19 },
        { shape: "diamond", resolution: 18, offset: 9 },
        { resolution: 8, alpha: 0.5 }
      ]);
      pixelateHelper = document.getElementById("pixelatedImage");
      data = pixelateHelper.toDataURL("image/png");
      pixelateHelperRef.current.removeChild(pixelateHelper);
      cb(data);
    }, 0);
  };

  const refreshPhoto = () => {
    if (isAway) {
      return;
    }

    getSnapshot(data => {
      if (data) {
        if (shouldPixelate === "true") {
          getPixelated(data, data => {
            setMySnapshot(data);
          });
        } else {
          setMySnapshot(data);
        }
      }
      clearTimeout(photoTimeoutRef.current);
      photoTimeoutRef.current = setTimeout(
        refreshPhoto,
        parseInt(screenshotDelay, 10) * 1000
      );
    });
  };

  const getFilteredUsers = () => {
    return Object.keys(users)
      .filter(userId => {
        return userId !== userRef.current.uid;
      })
      .map(userId => {
        return {
          ...users[userId],
          id: userId
        };
      })
      .filter(user => {
        return (
          user.picture &&
          user.name &&
          user.date > new Date().getTime() - 1000 * 40
        );
      });
  };

  React.useEffect(() => {
    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        userRef.current = user;
        if (user.displayName) {
          setName(user.displayName);
        }
        setIsAuthenticated(true);
        refreshPhoto();
      } else {
        setIsAuthenticated(false);
      }
    });

    rootRef.ref("users").on("value", snapshot => {
      const snapshotVal = snapshot.val();
      if (userRef.current && snapshotVal[userRef.current.uid]) {
        setCurrentMeeting(snapshotVal[userRef.current.uid].chatroom);
      }
      setUsers({
        ...users,
        ...snapshotVal
      });
    });
  }, []);

  React.useEffect(() => {
    if (!isAway) {
      refreshPhoto();
      if (userRef.current) {
        const userObj = rootRef.ref(`users/${userRef.current.uid}`);
        userObj.child("away").set(false);
      }
    } else {
      clearTimeout(photoTimeoutRef.current);
      if (userRef.current) {
        const userObj = rootRef.ref(`users/${userRef.current.uid}`);
        userObj.child("away").set(true);
      }
    }
  }, [isAway]);

  const generateZoomMeeting = () => {
    const zoomLauncher = window.open("https://zoom.us/start/videomeeting");
    return new Promise(resolve => {
      const startChecking = setInterval(() => {
        if (zoomLauncher.location.startsWith("https://zoom.us/s/")) {
          resolve(zoomLauncher.location.replace("https://zoom.us/s/", ""));
          zoomLauncher.close();
          clearInterval(startChecking);
        }
      }, 100);
    });
  };

  const joinUsersInChat = (userId, chatroom) => {
    firebase
      .database()
      .ref(`users/${userId}`)
      .child("chatroom")
      .set(chatroom);
    firebase
      .database()
      .ref(`users/${userRef.current.uid}`)
      .child("chatroom")
      .set(chatroom);
  };

  React.useEffect(() => {
    if (currentMeeting && !isAway) {
      window.open("https://zoom.us/j/" + currentMeeting);
      firebase
        .database()
        .ref(`users/${userRef.current.uid}`)
        .child("chatroom")
        .set(null);
    }
  }, [currentMeeting]);

  const createStartChat = userId => {
    return () => {
      generateZoomMeeting().then(meetingId => {
        joinUsersInChat(userId, meetingId);
      });
    };
  };

  const toggleAway = evt => {
    evt.preventDefault();
    setIsAway(!isAway);
  };

  if (!isAuthenticated) {
    return renderAuthenticate();
  }

  return (
    <div>
      <video ref={videoRef} id="video" width="320" style={{ display: "none" }}>
        Video stream not available.
      </video>
      <canvas
        ref={canvasRef}
        id="canvas"
        width="320"
        style={{ display: "none" }}
      />
      <div
        ref={pixelateHelperRef}
        id="pixelateHelper"
        style={{ display: "none" }}
      />
      <div className="navbar">
        <div className="navbar-brand">
          <div className="navbar-item">
            <a href="#" onClick={logout}>
              Logout
            </a>
          </div>
          <div className="navbar-item">
            <a href="#" onClick={toggleConfig}>
              Toggle Config
            </a>
          </div>
          <div className="navbar-item">
            <a href="#" onClick={toggleAway}>
              {isAway === "true" ? "Set Back" : "Set Away"}
            </a>
          </div>
        </div>
      </div>
      {isShowingConfig && (
        <div className="section">
          <div className="field is-horizontal">
            <div className="field-label is-normal">
              <label className="label">Photo Delay (seconds)</label>
            </div>
            <div className="field-body">
              <div className="field">
                <p className="control">
                  <input
                    className="input"
                    type="number"
                    value={screenshotDelay}
                    onChange={evt => {
                      setScreenshotDelay(evt.target.value);
                    }}
                  />
                </p>
              </div>
            </div>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={shouldPixelate === "true"}
              onChange={evt => {
                setShouldPixelate(shouldPixelate === "true" ? "false" : "true");
              }}
            />
            Pixelate
          </label>
        </div>
      )}

      {!isShowingConfig && isAway && (
        <div>
          You are set to AWAY. Your photo will not be taken, and you can't see
          your co-workers photos.
        </div>
      )}
      {!isShowingConfig && !isAway && (
        <div className="wrapper">
          <div className="card myCard">
            <div className="card-image">
              <figure className="image is-4by3">
                <img src={myPicture} />
              </figure>
            </div>
            <div className="foot">ME: {name}</div>
            <a className="hover" onClick={refreshPhoto}>
              Retake Photo
            </a>
          </div>
          {getFilteredUsers().map(user => (
            <div className="card myCard" key={user.id}>
              <div className="card-image">
                <figure className="image is-4by3">
                  <img src={user.picture} />
                </figure>
              </div>
              <div className="foot">
                {user.away ? (
                  <img src={icon} style={{ height: "20px", fill: "white" }} />
                ) : (
                  ""
                )}{" "}
                {user.name}
              </div>
              <a className="hover" onClick={createStartChat(user.id)}>
                {user.away ? `${user.name} is away` : "Start Chat"}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
