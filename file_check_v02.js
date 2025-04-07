const axios = require('axios').default;
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const ffmpeg = require('fluent-ffmpeg');
const util = require('node:util');
require('dotenv').config();

ffmpeg.setFfmpegPath('./ffmpeg/ffmpeg.exe');
ffmpeg.setFfprobePath('./ffmpeg/ffprobe.exe');

const OUT_FILENAME = '';
const BATCH_SIZE = 50;

const csvWriter = createCsvWriter({
  path: OUT_FILENAME,
  header: [
    { id: 'num', title: '№' },
    { id: 'name', title: 'Наименование' },
    { id: 'screen', title: 'Поверхность' },
    { id: 'container', title: 'Контейнер' },
    { id: 'codec', title: 'Кодек' },
    { id: 'resolution', title: 'Разрешение' },
    { id: 'frames', title: 'Количество кадров' },
    { id: 'duration', title: 'Хронометраж' },
    { id: 'fps', title: 'Фреймрейт' },
    { id: 'alpha', title: 'Альфа канал' },
    { id: 'OTK', title: 'OTK' },
  ],
});

const token = process.env.YAD_TOKEN;
const apiBaseUrl = 'https://cloud-api.yandex.net/v1/disk/resources?path=';
const filepath = 'disk:' + '';
const filePathEncoded = encodeURIComponent(filepath);

const objScreenResolution = {
  Ice: '6000x2600',
  Cube: '1920x1080',
  Top_Ring: '6390x168',
  Bottom_Ring: '4040x168',
  Faca: '3660x2688',
};

let outData = [];
let count = 0;

async function fetchData(url) {
  try {
    const response = await axios.get(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `OAuth ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching data from ${url}`, error.message);
    return null;
  }
}

async function getItems(path, limit = BATCH_SIZE, offset = 0) {
  const url = `${apiBaseUrl}${path}&limit=${limit}&offset=${offset}`;
  const data = await fetchData(url);
  return data?._embedded?.items || [];
}

async function getAllItems(path) {
  let offset = 0;
  let allItems = [];
  while (true) {
    const items = await getItems(path, BATCH_SIZE, offset);
    if (items.length === 0) break;
    allItems.push(...items);
    offset += BATCH_SIZE;
  }
  return allItems;
}

async function analyzeMedia(item) {
  const ffprobePromise = util.promisify(ffmpeg.ffprobe);
  const metadata = await ffprobePromise(item.file);
  const resolution = `${metadata.streams[0].width}x${metadata.streams[0].height}`;
  const name = item.path.slice(filepath.length + 1).replace(/\//g, '_');
  const alphaChannel = metadata.streams[0].pix_fmt.includes('a');
  const key = Object.keys(objScreenResolution).find((k) => name.includes(k));
  const OTK =
    key && objScreenResolution[key] === resolution
      ? true
      : `${key || ''} != ${resolution}`;

  return {
    name,
    resolution,
    container: metadata.format.format_long_name,
    codec: metadata.streams[0].codec_name,
    frames: metadata.streams[0].nb_frames,
    fps: metadata.streams[0].r_frame_rate.split('/')[0],
    duration: metadata.streams[0].duration,
    alpha: alphaChannel,
    OTK,
    screen: key || '',
  };
}

async function processItems(items) {
  const tasks = items.map(async (item) => {
    if (item.type === 'file' && ['video', 'image'].includes(item.media_type)) {
      try {
        const mediaData = await analyzeMedia(item);
        count += 1;
        outData.push({ num: count, ...mediaData });
      } catch (error) {
        console.error(`Error analyzing file: ${item.path}`, error.message);
      }
    } else if (item.type === 'dir') {
      const subItems = await getAllItems(encodeURIComponent(item.path));
      await processItems(subItems);
    }
  });
  await Promise.all(tasks);
}

async function createOffloadingFile() {
  console.time('Execution Time');
  try {
    const rootItems = await getAllItems(filePathEncoded);
    await processItems(rootItems);
    await csvWriter.writeRecords(outData);
    console.log('CSV file has been written successfully.');
  } catch (error) {
    console.error('Error during execution:', error.message);
  }
  console.timeEnd('Execution Time');
}

createOffloadingFile();

// async function createOffloadingFile() {
//   console.time('Time all');
//   const itemsArr = [];
//   let offset = 0;

//   while (true) {
//     const items = await getDataByLimit(50, offset);
//     offset += 50;
//     if (items.length === 0) {
//       break;
//     }

//     for (let i = 0; i < items.length; i++) {
//       itemsArr.push(items[i]);
//     }
//   }

//   console.log(itemsArr.length);
//   if (itemsArr.length > 0) {
//     for (let i = 0; i < itemsArr.length + 2; i++) {
//       await getUnderFiles(itemsArr[i]);
//       // break;
//     }
//   }
//   // console.log(out_data);
//   csvWriter
//     .writeRecords(outData)
//     .then(() => console.log('The CSV file was written successfully'));

//   console.timeEnd('Time all');
// }

// async function getDataByLimit(limit, offset) {
//   try {
//     let response_folders_data = await axios.get(
//       apiBaseUrl + filePathEncoded + `&limit=${limit}` + `&offset=${offset}`,
//       {
//         headers: {
//           Accept: 'application/json',
//           Authorization: 'OAuth ' + token,
//         },
//       }
//     );
//     let data = response_folders_data.data;
//     let items = data._embedded.items;
//     return items;
//   } catch (e) {
//     console.log(e);
//   }
// }

// async function getUnderFiles(item) {
//   try {
//     if (!item?.type) {
//       console.error('item', item);
//       return;
//     }

//     if (item.type === 'dir') {
//       const item_data = await getAllFolderData(item.path, 50, 0);
//       if (item_data.length > 0) {
//         for (let j = 0; j < item_data.length; j++) {
//           // console.log(item_data[j].path);
//           await getUnderFiles(item_data[j]);
//           // break;
//         }
//       }
//     } else if (item.type === 'file' && item.media_type === 'video') {
//       const ffprobePromise = util.promisify(ffmpeg.ffprobe);
//       const metadata = await ffprobePromise(item.file);

//       let resolution =
//         metadata.streams[0].width + 'x' + metadata.streams[0].height;
//       let name = item.path
//         .slice(filepath.length + 1, String(item.path).length)
//         .replace(replacer, '_');

//       const alphaChannel = metadata.streams[0].pix_fmt.includes('a')
//         ? true
//         : false;

//       console.log(name);

//       // let key;
//       let key = Object.keys(objScreenResolution).find((k) => name.includes(k));
//       let OTK = false;

//       if (key && objScreenResolution[key] === resolution) {
//         OTK = true;
//       } else {
//         OTK = `${key} != ${resolution}`;
//       }

//       // if (resolution === '1536x2112') {
//       //   OTK = true;
//       // }

//       count = count + 1;
//       outData.push({
//         num: count,
//         name,
//         screen: key || '',
//         duration: metadata.streams[0].duration,
//         container: metadata.format.format_long_name,
//         resolution,
//         codec: metadata.streams[0].codec_name,
//         frames: metadata.streams[0].nb_frames,
//         fps: metadata.streams[0].r_frame_rate.split('/')[0],
//         alpha: alphaChannel,
//         OTK,
//       });
//     } else if (item.type === 'file' && item.media_type === 'image') {
//       const ffprobePromise = util.promisify(ffmpeg.ffprobe);
//       const metadata = await ffprobePromise(item.file);
//       const resolution =
//         metadata.streams[0].width + 'x' + metadata.streams[0].height;
//       const name = item.path
//         .slice(filepath.length + 1, String(item.path).length)
//         .replace(replacer, '_');

//       const alphaChannel = metadata.streams[0].pix_fmt.includes('a')
//         ? true
//         : false;

//       console.log(name);

//       count = count + 1;
//       outData.push({
//         num: count,
//         name,
//         duration: metadata.streams[0].duration,
//         alpha: alphaChannel,
//         resolution: resolution,
//       });
//     }
//   } catch (err) {
//     console.error(err);
//   }
// }

// async function getAllFolderData(folder, limit, offset) {
//   try {
//     const folderData = [];
//     const getData = function (newLimit, newOffset) {
//       return new Promise((resolve, reject) =>
//         axios
//           .get(
//             apiBaseUrl +
//               encodeURIComponent(folder) +
//               `&limit=${newLimit}` +
//               `&offset=${newOffset}`,
//             {
//               headers: {
//                 Accept: 'application/json',
//                 Authorization: 'OAuth ' + token,
//               },
//             }
//           )
//           .then((item) => resolve(item.data._embedded.items))
//           .catch((err) => reject(err))
//       );
//     };

//     while (true) {
//       const items = await getData(limit, offset);
//       offset += 50;
//       if (items.length === 0) {
//         break;
//       }

//       for (let i = 0; i < items.length; i++) {
//         folderData.push(items[i]);
//       }
//     }

//     return folderData;
//   } catch {
//     console.error(
//       `Error with get folderdata status code ${response_data.status} `
//     );
//   }
// }

// createOffloadingFile();
