const axios = require('axios').default;
// const { getVideoDurationInSeconds } = require('get-video-duration');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const ffmpeg = require('fluent-ffmpeg');
// const fs = require('fs');
const util = require('node:util');
require('dotenv').config();

const out_filename = 'file_check_.csv';

ffmpeg.setFfmpegPath('./ffmpeg/ffmpeg.exe');
ffmpeg.setFfprobePath('./ffmpeg/ffprobe.exe');

const csvWriter = createCsvWriter({
  path: out_filename,
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

const url = 'https://cloud-api.yandex.net/v1/disk/resources?path=';
const filepath = 'disk:' + '';
const filepathURI = encodeURIComponent(filepath);

const objScreenResolution = {
  PROJECTION: '5000x2166',
  ICE: '5000x2166',
  LEFT_SIDE: '1872x2184',
  RIGHT_SIDE: '1872x2184',
  MEDIACUBE_CENTER: '920x520',
  MEDIACUBE_TOP_BOTTOM: '840x360',
  STRIPE: '3408x72',
};

let out_data = [];

let count = 0;

const search = '/';
const replacer = new RegExp(search, 'g');

async function createOffloadingFile() {
  console.time('Time all');
  const itemsArr = [];
  let offset = 0;

  while (true) {
    const items = await getDataByLimit(50, offset);
    offset += 50;
    if (items.length === 0) {
      break;
    }

    for (let i = 0; i < items.length; i++) {
      itemsArr.push(items[i]);
    }
  }

  console.log(itemsArr.length);
  if (itemsArr.length > 0) {
    for (let i = 0; i < itemsArr.length + 2; i++) {
      await getUnderFiles(itemsArr[i]);
      // break;
    }
  }
  // console.log(out_data);
  csvWriter
    .writeRecords(out_data)
    .then(() => console.log('The CSV file was written successfully'));

  console.timeEnd('Time all');
}

async function getDataByLimit(limit, offset) {
  try {
    let response_folders_data = await axios.get(
      url + filepathURI + `&limit=${limit}` + `&offset=${offset}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'OAuth ' + token,
        },
      }
    );
    let data = response_folders_data.data;
    let items = data._embedded.items;
    return items;
  } catch (e) {
    console.log(e);
  }
}

async function getUnderFiles(item) {
  try {
    if (!item?.type) {
      console.error('item', item);
      return;
    }

    if (item.type === 'dir') {
      const item_data = await getAllFolderData(item.path, 50, 0);
      if (item_data.length > 0) {
        for (let j = 0; j < item_data.length; j++) {
          // console.log(item_data[j].path);
          await getUnderFiles(item_data[j]);
          // break;
        }
      }
    } else if (item.type === 'file' && item.media_type === 'video') {
      const ffprobePromise = util.promisify(ffmpeg.ffprobe);
      const metadata = await ffprobePromise(item.file);

      let resolution =
        metadata.streams[0].width + 'x' + metadata.streams[0].height;
      let name = item.path
        .slice(filepath.length + 1, String(item.path).length)
        .replace(replacer, '_');

      console.log(name);

      // let key;
      let key = Object.keys(objScreenResolution).find((k) =>
        name.toLocaleUpperCase().includes(k.toLocaleUpperCase())
      );
      let OTK = false;

      if (key && objScreenResolution[key] === resolution) {
        OTK = true;
      } else {
        OTK = `${key} != ${resolution}`;
      }

      count = count + 1;
      out_data.push({
        num: count,
        name,
        screen: key || '',
        duration: metadata.streams[0].duration,
        container: metadata.format.format_long_name,
        resolution,
        codec: metadata.streams[0].codec_name,
        frames: metadata.streams[0].nb_frames,
        fps: metadata.streams[0].r_frame_rate.split('/')[0],
        alpha: metadata.streams[0].pix_fmt.includes('a') ? true : false,
        OTK,
      });
    } else if (item.type === 'file' && item.media_type === 'image') {
      const ffprobePromise = util.promisify(ffmpeg.ffprobe);
      const metadata = await ffprobePromise(item.file);
      const resolution =
        metadata.streams[0].width + 'x' + metadata.streams[0].height;
      const name = item.path
        .slice(filepath.length + 1, String(item.path).length)
        .replace(replacer, '_');

      console.log(name);

      count = count + 1;
      out_data.push({
        num: count,
        name,
        duration: metadata.streams[0].duration,
        resolution: resolution,
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function getAllFolderData(folder, limit, offset) {
  try {
    const folderData = [];
    const getData = function (newLimit, newOffset) {
      return new Promise((resolve, reject) =>
        axios
          .get(
            url +
              encodeURIComponent(folder) +
              `&limit=${newLimit}` +
              `&offset=${newOffset}`,
            {
              headers: {
                Accept: 'application/json',
                Authorization: 'OAuth ' + token,
              },
            }
          )
          .then((item) => resolve(item.data._embedded.items))
          .catch((err) => reject(err))
      );
    };

    while (true) {
      const items = await getData(limit, offset);
      offset += 50;
      if (items.length === 0) {
        break;
      }

      for (let i = 0; i < items.length; i++) {
        folderData.push(items[i]);
      }
    }

    return folderData;
  } catch {
    console.error(
      `Error with get folderdata status code ${response_data.status} `
    );
  }
}

async function getFolderData(folder, limit, offset) {
  try {
    let response_data = await axios.get(
      url +
        encodeURIComponent(folder) +
        `&limit=${limit}` +
        `&offset=${offset}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'OAuth ' + token,
        },
      }
    );
    return response_data.data._embedded.items;
  } catch {
    console.error(
      `Error with get folderdata status code ${response_data.status} `
    );
  }
}

createOffloadingFile();
