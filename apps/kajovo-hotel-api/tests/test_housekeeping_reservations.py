from datetime import date

import pytest

from app.api.schemas import HousekeepingStayRead
from app.services.housekeeping import _stay_read
from app.services.housekeeping_reservations import guest_age, reservation_details
from tests.test_housekeeping import FakeHousekeepingClient, _reservation


DAY = date(2026, 10, 3)


def booking():
    return _reservation('r', 'room-101', '101', arrival='2026-10-02', departure='2026-10-04', persons=3)


@pytest.mark.parametrize('birth,expected', [('2024-10-04', 'infants'), ('2024-10-03', 'children'), ('2008-10-04', 'children'), ('2008-10-03', 'adults')])
def test_birthdays_override_reservation_category(birth, expected):
    assert guest_age({'guest': {'birth_date': birth}, 'guest_type': {'id': 'adult', 'age_limit': None}}, DAY)[1] == expected


@pytest.mark.parametrize('limit,expected', [(None, 'adults'), (2, 'infants'), (6, 'children'), (17, 'children')])
def test_missing_birth_uses_every_reservation_guest_category(limit, expected):
    assert guest_age({'guest_type': {'id': 'category', 'age_limit': limit}}, DAY) == (None, expected)


def test_counts_include_all_room_guests_regardless_of_meals_and_hide_unknown_totals():
    reservation = booking()
    reservation['guest_list'] = [{'guest': {'birth_date': '1980-01-01'}, 'food': 0}, {'guest': {'birth_date': '2020-01-01'}, 'food': 1}, {'guest': {'birth_date': '2025-01-01'}, 'food': 0}]
    result = reservation_details(reservation, DAY)
    assert [result[key] for key in ('adults', 'children', 'infants')] == [1, 1, 1]
    reservation['guest_list'][1]['guest']['birth_date'] = None
    result = reservation_details(reservation, DAY)
    assert result['unknown_persons'] == 1
    assert all(result[key] is None for key in ('adults', 'children', 'infants'))
    assert 'birth_date' not in result['guests'][0]


def test_name_and_country_follow_guest_position_then_booker_then_company():
    reservation = booking()
    reservation.update(main_guest='main', guest={'id': 'main', 'first_name': 'Booker', 'last_name': 'Main', 'address': {'country': 'CZE'}}, company={'name': 'Company', 'address': {'country': 'AUT'}}, guest_list=[{'position': 2, 'guest': {'first_name': 'Second', 'last_name': 'Guest', 'address': {'country': 'POL'}}}, {'position': 1, 'guest': {'first_name': 'First', 'last_name': 'Guest', 'address': {'country': 'DEU'}}}])
    result = reservation_details(reservation, DAY)
    assert result['display_name'] == 'Guest First'
    assert result['country_code'] == 'DE'
    assert result['country_code_alpha3'] == 'DEU'
    first_guest = reservation['guest_list'][1]['guest']
    first_guest.clear()
    result = reservation_details(reservation, DAY)
    assert result['display_name'] == 'Guest Second'
    assert result['country_code_alpha3'] == 'POL'
    reservation['guest_list'].append({'position': 3, 'guest': {'first_name': 'Third', 'address': {'country': 'FRA'}}})
    reservation['guest_list'][0]['guest'].clear()
    assert reservation_details(reservation, DAY)['display_name'] == 'Third'
    assert reservation_details(reservation, DAY)['country_code_alpha3'] == 'FRA'
    reservation['guest_list'] = []
    assert reservation_details(reservation, DAY)['display_name'] == 'Main Booker'
    assert reservation_details(reservation, DAY)['country_code'] == 'CZ'
    reservation['guest']['address'] = {}
    assert reservation_details(reservation, DAY)['country_code'] == 'AT'
    reservation['main_guest'] = None
    assert reservation_details(reservation, DAY)['display_name'] == 'Company'
    reservation['company'] = None
    assert reservation_details(reservation, DAY)['display_name'] is None
    assert reservation_details(reservation, DAY)['country_code'] is None
    assert reservation_details(reservation, DAY)['country_code_alpha3'] is None


def test_name_and_country_skip_empty_values_independently():
    reservation = booking()
    reservation.update(main_guest={'first_name': 'Booker', 'address': {'country': 'CZE'}}, company={'name': 'Company', 'address': {'country': 'AUT'}}, guest_list=[{'position': 2, 'guest': {'address': {'country': 'DEU'}}}, {'position': 1, 'guest': {'last_name': 'Lodged', 'address': {'country': 'invalid'}}}])
    result = reservation_details(reservation, DAY)
    assert result['display_name'] == 'Lodged'
    assert result['country_code_alpha3'] == 'DEU'
    reservation['guest_list'][0]['guest']['address'] = {}
    assert reservation_details(reservation, DAY)['country_code_alpha3'] == 'CZE'
    reservation['main_guest']['address'] = {}
    assert reservation_details(reservation, DAY)['country_code_alpha3'] == 'AUT'


@pytest.mark.parametrize('source,alpha2,alpha3', [('CZ', 'CZ', 'CZE'), ('CZE', 'CZ', 'CZE'), ('deu', 'DE', 'DEU'), ('GB', 'GB', 'GBR'), ('USA', 'US', 'USA'), ('ZZZ', None, None), ('', None, None)])
def test_country_alpha3_is_official_and_preserves_native_alpha2(source, alpha2, alpha3):
    reservation = booking()
    reservation['guest_list'] = [{'guest': {'address': {'country': source}}}]
    result = HousekeepingStayRead.model_validate(_stay_read(reservation, DAY)).model_dump()
    assert result['country_code'] == alpha2
    assert result['country_code_alpha3'] == alpha3


def test_charges_sum_nights_include_settled_items_deduplicate_and_ignore_cancelled():
    reservation = booking()
    first = {'id': 'a', 'label': 'Domácí mazlíček', 'quantity': 2, 'date': '2026-10-02', 'is_open': False, 'billed': 100}
    reservation['bill'] = {'bill_item': [first, first, {'id': 'b', 'label': 'DOMÁCÍ MAZLÍČEK – další noc', 'quantity': 3, 'is_open': True}, {'id': 'cancel', 'label': 'Domácí mazlíček', 'quantity': 10, 'archived': True}, {'id': 'cot', 'label': 'Dětská postýlka', 'quantity': 3}]}
    result = reservation_details(reservation, DAY)
    assert result['dog_count'] == 5
    assert result['cot_required'] is True
    assert len(result['charges']) == 3
    assert reservation_details(booking(), DAY)['dog_count'] == 0
    reservation['bill'] = 'unexpanded'
    assert reservation_details(reservation, DAY)['dog_count'] is None


@pytest.mark.parametrize('quantity', ['0.5', 'NaN', None])
def test_invalid_pet_quantities_are_unknown_instead_of_rounded(quantity):
    reservation = booking()
    reservation['bill'] = {'bill_item': [{'label': 'Domácí mazlíček', 'quantity': quantity}]}
    assert reservation_details(reservation, DAY)['dog_count'] is None


def test_expected_times_are_not_replaced_by_actual_events_and_model_keeps_native_fields():
    reservation = booking()
    reservation.update(arrival_time='14:05', departure_time=None, reservation_action=[{'checkedin': '2026-10-02T16:00:00Z'}])
    result = _stay_read(reservation, DAY)
    assert result['arrival_time'] == '14:05'
    assert result['departure_time'] is None
    validated = HousekeepingStayRead.model_validate(result).model_dump()
    for key in ('reservation_id', 'guest_label', 'persons', 'country_name', 'country_code', 'housekeeping_note', 'arrival', 'departure', 'checked_in', 'checked_out', 'amenities'):
        assert key in validated


@pytest.mark.parametrize('name,state', [('Potvrzeno', 'confirmed'), ('Check-in', 'checked_in'), ('Check-out', 'checked_out'), ('Opce', 'option')])
def test_reservation_states_are_independent_of_cleaning_and_action_time(name, state):
    reservation = booking()
    reservation['reservation_status'] = {'name': name}
    assert reservation_details(reservation, DAY)['reservation_state'] == state


def test_options_are_opt_in_and_do_not_occupy_rooms_even_with_bad_action_metadata():
    client = FakeHousekeepingClient()
    option = _reservation('option', 'room-101', '101', arrival='2026-09-17', departure='2026-09-18', checkedin='2026-09-17T12:00:00Z')
    option['reservation_status'] = {'name': 'Opce'}
    client.list_reservations = lambda day, range_type, state: [option]
    assert client.build_overview(date(2026, 9, 17))['rooms'][0]['arrivals'] == []
    room = client.build_overview(date(2026, 9, 17), include_options=True)['rooms'][0]
    assert room['arrivals'][0]['reservation_state'] == 'option'
    assert room['occupied'] is False


def test_billing_is_scoped_to_each_reservations_room():
    client = FakeHousekeepingClient()
    dog = _reservation('dog', 'room-101', '101', arrival='2026-09-17', departure='2026-09-18')
    dog['bill'] = {'bill_item': [{'label': 'Domácí mazlíček', 'quantity': 2}]}
    cot = _reservation('cot', 'room-102', '102', arrival='2026-09-17', departure='2026-09-18')
    cot['bill'] = {'bill_item': [{'label': 'Dětská postýlka', 'quantity': 4}]}
    client.reservations_for_day = lambda day: [dog, cot]
    rooms = client.build_overview(date(2026, 9, 17))['rooms']
    assert rooms[0]['arrivals'][0]['dog_count'] == 2
    assert rooms[0]['arrivals'][0]['cot_required'] is False
    assert rooms[1]['arrivals'][0]['dog_count'] == 0
    assert rooms[1]['arrivals'][0]['cot_required'] is True


@pytest.mark.parametrize('method', ['GET', 'PATCH'])
@pytest.mark.parametrize('include_options', [False, True])
def test_web_query_is_preserved_in_reads_and_verified_write_response(monkeypatch, method, include_options):
    from types import SimpleNamespace

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.api.routes import housekeeping as route
    from app.db.session import get_db

    provider = FakeHousekeepingClient()
    provider.reservations_for_day = lambda day: []
    calls = []
    original = provider.build_overview

    def overview(day, **kwargs):
        calls.append(kwargs.get('include_options', False))
        return original(day)

    provider.build_overview = overview
    provider.update_room_status = lambda *args, **kwargs: None
    monkeypatch.setattr(route, '_client', lambda: provider)
    monkeypatch.setattr(route, 'enrich_overview', lambda db, overview: overview)
    app = FastAPI()
    app.add_api_route('/rooms', route.get_housekeeping_rooms, methods=['GET'])
    app.add_api_route('/rooms/{room_id}', route.update_housekeeping_room_status, methods=['PATCH'])
    app.dependency_overrides[get_db] = lambda: SimpleNamespace(bind=None)
    path = '/rooms' if method == 'GET' else '/rooms/room-101'
    query = '?date=2026-09-17' + ('&include_options=true' if include_options else '')
    response = TestClient(app).request(method, path + query, **({'json': {'status': 'clean', 'expected_status': 'dirty'}} if method == 'PATCH' else {}))
    assert response.status_code == 200
    assert calls == [include_options]
