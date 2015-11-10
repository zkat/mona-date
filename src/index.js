import {
  and,
  followedBy,
  maybe,
  or,
  sequence
} from '@mona/combinators'

import {
  eof,
  fail,
  label,
  value
} from '@mona/core'

import {
  integer
} from '@mona/numbers'

import {
  noneOf,
  spaces,
  string,
  text
} from '@mona/strings'

import {parse} from '@mona/parse'

// TODO - get rid of this dependency eventually.
import moment from 'moment'

/**
 * Parses a variety of date inputs, including relative dates. Also includes
 * shortcuts such as 'today', 'now', and 'yesterday'. All dates are parsed into
 * the past, with the current day as a reference. All dates returned are are
 * truncated to midnight on that day.
 *
 * @param {String} string - String to parse the date from.
 * @param {Object} opts - Options object. Passed to mona.parse directly.
 * @returns {Date} - The date represented by `string`.
 *
 * @example
 * now
 * today
 * yesterday
 * 3 days ago
 * 3 days before yesterday
 * 5 weeks from now // into the past!
 * Aug 20, 2010
 * Aug 19 // Uses the current year
 * August 2011 // First day of August 2011
 */
export function parseDate (string, opts) {
  return parse(englishDateParser(), string, opts)
}

/**
 * Utility for parsing formats that moment recognizes.
 */
function momentParser (unit, formats) {
  return label(sequence(s => {
    var str = s(text(noneOf(' ')))
    var formatted
    for (var i = 0; i < formats.length; i++) {
      formatted = moment(str, formats[i])
      if (formatted && formatted.isValid()) {
        return value(formatted[unit]())
      }
    }
    return fail()
  }), unit)
}

/**
 * Parses a text month in either short (Aug) or long (August) formats.
 */
function month () {
  return momentParser('month', ['MMM', 'M'])
}

/**
 * Parses an integer between 1 and 31.
 */
function day () {
  // TODO - We always get the month first -- so why not pass the month into here
  //        and validate that that particular month can have this as a day? It
  //        could make error reporting nicer, too. And show off a nice feature
  //        of mona.
  return label(sequence(s => {
    var dayNum = s(integer())
    if (dayNum >= 1 && dayNum <= 31) {
      return value(dayNum)
    } else {
      return fail()
    }
  }), 'day')
}

/**
 * Parses a year in long (2013) format.
 */
function year () {
  return momentParser('year', ['YYYY'])
}

/**
 * Parses the strings 'today' and 'now' to the current date.
 */
function now () {
  return and(or(string('today'), string('now')),
             value(moment().startOf('day').toDate()))
}

/**
 * Parses the string 'yesterday' to the day before the current date.
 */
function yesterday () {
  return and(string('yesterday'),
             value(moment().subtract('day', 1).startOf('day').toDate()))
}

/**
 * Parses an interval to be used by the relative date parser. Intervals must be
 * integer-cardinal numbers. 'the' works as an alias for the number 1, so we can
 * say 'the day before yesterday'.
 */
function interval () {
  return or(integer(),
            and(string('the'), value(1)))
}

/**
 * The unit the interval will use to shift the date. Can be either the singular
 * or plural version of 'day', 'weeek', 'month', or 'year'.
 */
function intervalUnit () {
  return sequence(s => {
    var unit = s(or(string('day'),
                    string('week'),
                    string('month'),
                    string('year')))
    s(maybe(string('s')))
    return value(unit)
  })
}

/**
 * The reference date that will be shifted by the interval. 'ago' acts as an
 * alias for the current date in this case, so '1 day ago' is the same as '1 day
 * from today'. 'from', 'before', or 'until' are used to make the reference
 * date, and have no semantic distinction. The reference date itself can be any
 * date parsed by the englishDateParser (which includes relative dates, so this
 * can be recursive).
 */
function referenceDate () {
  const ago = () => and(string('ago'),
                        value(moment().startOf('day').toDate()))
  return or(ago(),
            and(or(string('from'),
                   string('before'),
                   string('until')),
                spaces(),
                englishDateParser()))
}

/**
 * Puts together the relative date pieces and returns a date that's been shifted
 * into the past by the given interval.
 */
function relativeDate () {
  return sequence(function (s) {
    var _interval = s(or(interval(), value(1)))
    s(maybe(spaces()))
    var _intervalUnit = s(intervalUnit())
    s(spaces())
    var reference = s(referenceDate())
    return value(
      moment(reference).subtract(_intervalUnit, _interval).toDate())
  })
}

/**
 * Parses a date in Month + Year syntax, such as 'January 2010'. The day is set
 * to the first of the month in the resulting date.
 */
function monthAndYear () {
  return sequence(function (s) {
    var _month = s(month())
    s(spaces())
    var _year = s(year())
    var mo = moment([_year, _month, 1])
    return mo.isValid()
      ? value(mo.toDate())
      : fail('invalid date', 'invalid')
  })
}

/**
 * Parses a date in Month + Day syntax, such as 'Jan 1'. The year is set to be
 * the current year in the resulting date.
 */
function monthAndDay () {
  return sequence(function (s) {
    var _month = s(month())
    s(spaces())
    var _day = s(day())
    var mo = moment([moment().year(), _month, _day])
    return mo.isValid()
      ? value(mo.toDate())
      : fail('invalid date', 'invalid')
  })
}

/**
 * Parses a full date that includes Month, Day, and Year, with an optional comma
 * between the day and year.
 */
function fullDate () {
  return sequence(function (s) {
    var _month = s(month())
    s(spaces())
    var _day = s(day())
    s(maybe(string(',')))
    s(maybe(spaces()))
    var _year = s(year())
    var mo = moment([_year, _month, _day])
    return mo.isValid()
      ? value(mo.toDate())
      : fail('invalid date', 'invalid')
  })
}

/**
 * Puts the various locale date parsers together to try and get a reasonable
 * fallback.
 */
function localeDate () {
  // TODO - Maybe there's a better way to do this, but this was the
  //        simplest/most readable version I could come up with without having
  //        amb().
  return or(fullDate(),
            monthAndDay(),
            monthAndYear())
}

/**
 * Puts all the various date-related parsers together.
 */
function englishDateParser () {
  return followedBy(
    and(maybe(spaces()),
        or(localeDate(),
           relativeDate(),
           now(),
           yesterday())),
    maybe(spaces()),
    eof())
}

function runExample () {
  function logExample (string) {
    try {
      console.log(string, ' => ', moment(parseDate(string)).format('ll'))
    } catch (e) {
      console.log('Error: ', e)
    }
  }
  logExample('today')
  logExample('1 day ago')
  logExample('2 weeks ago')
  logExample('1 month from 2 days from today')
  logExample('Aug 27, 2013')
  logExample('August 27')
  logExample('Aug 2011')
  logExample('1 month from 2 days before Aug 30')
}
if (module.id === '.') runExample()
