const axios = require('axios').default;
const { getVideoDurationInSeconds } = require('get-video-duration');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
require('dotenv').config();

const out_filename = '.csv';

const csvWriter = createCsvWriter({
  path: out_filename,
  header: [
    { id: 'num', title: '№' },
    { id: 'name', title: 'Вид Работ - РИД и их описание' },
    { id: 'duration', title: 'Хронометраж' },
    { id: 'SecDuration', title: 'Продолжительность (сек.)' },
  ],
});

const token = process.env.YAD_TOKEN;
const limit = '&limit=50';
const url = 'https://cloud-api.yandex.net/v1/disk/resources?path=';
const filepath = 'disk:' + '';
const filepathURI = encodeURIComponent(filepath);

let out_data = [];

let count = 0;

const search = '/';
const replacer = new RegExp(search, 'g');

async function createOffloadingFile() {
  let response_folders_data = await axios.get(url + filepathURI + limit, {
    headers: {
      Accept: 'application/json',
      Authorization: 'OAuth ' + token,
    },
  });
  console.time('Time all');
  let data = response_folders_data.data;
  let items = data._embedded.items;
  console.log(items.length);
  if (items.length > 0) {
    for (let i = 0; i < items.length + 2; i++) {
      await getUnderFiles(items[i]);
    }
  }
  console.log(out_data);
  csvWriter
    .writeRecords(out_data)
    .then(() => console.log('The CSV file was written successfully'));

  console.timeEnd('Time all');
}

async function getUnderFiles(item) {
  try {
    if (!item?.type) {
      console.error('item', item);
      return;
    }

    if (item.type === 'dir') {
      let item_data = await getFolderData(item.path);
      if (item_data.length > 0) {
        for (let j = 0; j < item_data.length; j++) {
          console.log(item_data[j].path);
          await getUnderFiles(item_data[j]);
        }
      }
    } else if (item.type === 'file' && item.media_type === 'video') {
      let duration = await getVideoDurationInSeconds(item.file);
      let name = item.path
        .slice(filepath.length + 1, String(item.path).length)
        .replace(replacer, '_');
      let date = new Date(0);
      date.setSeconds(duration);
      let str_duration = date.toISOString().substring(11, 19);

      count = count + 1;
      out_data.push({
        num: count,
        name: name,
        duration: str_duration,
        SecDuration: `${Math.trunc(duration)} (${Numtotext(duration)}) сек.`,
      });
    } else if (item.type === 'file' && item.media_type === 'image') {
      let duration = 0;
      let name = item.path
        .slice(filepath.length + 1, String(item.path).length)
        .replace(replacer, '_');
      let date = new Date(0);
      date.setSeconds(duration);
      let str_duration = date.toISOString().substring(11, 19);

      count = count + 1;
      out_data.push({
        num: count,
        name: name,
        duration: str_duration,
        SecDuration: `${Math.trunc(duration)} (${Numtotext(duration)}) сек.`,
      });
    }
  } catch (err) {
    console.error(err);
  }
}

async function getFolderData(folder) {
  try {
    let response_data = await axios.get(url + encodeURIComponent(folder), {
      headers: {
        Accept: 'application/json',
        Authorization: 'OAuth ' + token,
      },
    });
    return response_data.data._embedded.items;
  } catch {
    console.error(
      `Error with get folderdata status code ${response_data.status} `
    );
  }
}

function Numtotext(dig) {
  this.words = {
    m3: [
      ['тысяча', 'тысячи', 'тысяч'],
      ['миллион', 'миллиона', 'миллионов'],
      ['миллиард', 'миллиарда', 'миллиардов'],
    ],
    m2: [
      'сто',
      'двести',
      'триста',
      'четыреста',
      'пятьсот',
      'шестьсот',
      'семьсот',
      'восемьсот',
      'девятьсот',
    ],
    m1: [
      'десять',
      'двадцать',
      'тридцать',
      'сорок',
      'пятьдесят',
      'шестьдесят',
      'семьдесят',
      'восемьдесят',
      'девяносто',
    ],
    m0: [
      'ноль',
      'одина',
      'двe',
      'три',
      'четыре',
      'пять',
      'шесть',
      'семь',
      'восемь',
      'девять',
      'десять',
    ],
    f0: ['ноль', 'одна', 'две'],
    l0: [
      'десять',
      'одиннадцать',
      'двенадцать',
      'тринадцать',
      'четырнадцать',
      'пятнадцать',
      'шестнадцать',
      'семнадцать',
      'восемнадцать',
      'девятнадцать',
    ],
  };
  this.dim = function (dig, power, words) {
    let result = '';
    let pow = Math.floor(dig / Math.pow(10, power)) % Math.pow(10, 3);
    if (!pow) return result;
    let n2 = Math.floor(pow / 100);
    let n1 = Math.floor((pow % Math.pow(10, 2)) / 10);
    let n0 = Math.floor(pow % 10);
    let s1 = n1 > 0 ? ' ' : '';
    let s0 = n0 > 0 ? ' ' : '';
    let get_n = function () {
      switch (power) {
        case 0:
        case 6:
        case 9:
          result += s0 + words.m0[n0 - 1];
          break;
        case 3:
          if (n0 < 3) {
            result += s0 + words.f0[n0 - 1];
          } else {
            result += s0 + words.m0[n0 - 1];
          }
          break;
      }
    };
    if (n2 > 0) {
      result += words.m2[n2 - 1];
    }
    if (n1 > 0) {
      if (n1 > 1) {
        result += s1 + words.m1[n1 - 1];
        if (n0 > 0) get_n();
      } else {
        result += s1 + words.l0[n0];
      }
    } else {
      if (n0 > 0) get_n();
    }
    if (power) {
      let d = (power - 3) / 3;
      if (d == 0 && n0 + n1 * 10 >= 11 && n0 + n1 * 10 <= 14) {
        result += ' ' + words.m3[0][2];
      } else if (n0 == 1) {
        result += ' ' + words.m3[d][0];
      } else if (n0 >= 2 && n0 <= 4) {
        result += ' ' + words.m3[d][1];
      } else if (n0 == 0 || (n0 >= 5 && n0 <= 9)) {
        result += ' ' + words.m3[d][2];
      }
    }
    return result;
  };
  this.result = '';
  for (let i = 9; i > -1; i -= 3) {
    this.result += this.dim(dig, i, this.words) + ' ';
  }
  return this.result.replace(/[\s]{2,}/gi, ' ').trim();
}

createOffloadingFile();
